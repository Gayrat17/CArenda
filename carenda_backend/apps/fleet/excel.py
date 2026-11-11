import io
from decimal import Decimal
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from apps.fleet.models import Car, Contract, Payment
from apps.users.models import User


def generate_tenant_excel_report(owner: User) -> bytes:
    """
    Generates a multi-sheet Excel spreadsheet in memory containing:
    1. Cars and Contracts summary (Mashinalar va Shartnomalar)
    2. Detailed monthly payment schedule (To'lovlar Jadvali)
    """
    wb = Workbook()

    # Style constants
    header_fill = PatternFill(
        start_color="1E3A8A", end_color="1E3A8A", fill_type="solid"
    )  # Dark Blue
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10)
    border_thin = Side(border_style="thin", color="CBD5E1")
    cell_border = Border(
        top=border_thin, left=border_thin, right=border_thin, bottom=border_thin
    )
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    # ==========================================
    # Sheet 1: Mashinalar va Shartnomalar
    # ==========================================
    ws1 = wb.active
    ws1.title = "Mashinalar va Shartnomalar"

    headers1 = [
        "Mashina",
        "Davlat raqami",
        "Holati",
        "Haydovchi",
        "Telefon",
        "Mashina narxi ($)",
        "Boshlang'ich to'lov ($)",
        "Qoldiq ($)",
        "Yillik %",
        "Jami summa ($)",
        "Oylik to'lov ($)",
        "Boshlangan sana",
    ]
    ws1.append(headers1)

    cars_qs = owner.cars.all().order_by("-created_at")
    for car in cars_qs:
        active_contract = (
            car.contracts.filter(is_active=True)
            .select_related("driver")
            .first()
        )
        status_map = {
            Car.Status.AVAILABLE: "Bo'sh",
            Car.Status.RENTED: "Ijarada",
            Car.Status.MAINTENANCE: "Ta'mirda",
        }

        row = [
            car.name,
            car.plate_number,
            status_map.get(car.status, car.status),
            active_contract.driver.full_name if active_contract else "—",
            active_contract.driver.phone if active_contract else "—",
            float(active_contract.car_price)
            if active_contract
            else float(car.default_price),
            float(active_contract.initial_payment) if active_contract else 0.00,
            float(active_contract.principal_amount) if active_contract else 0.00,
            float(active_contract.annual_percent) if active_contract else 0.00,
            float(active_contract.total_amount) if active_contract else 0.00,
            float(active_contract.monthly_amount) if active_contract else 0.00,
            str(active_contract.start_date) if active_contract else "—",
        ]
        ws1.append(row)

    # Style Sheet 1
    for cell in ws1[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for row in ws1.iter_rows(min_row=2):
        for idx, cell in enumerate(row):
            cell.font = data_font
            cell.border = cell_border
            # Number / currency columns (5..10)
            if idx in (5, 6, 7, 9, 10):
                cell.alignment = align_right
                cell.number_format = "$#,##0.00"
            elif idx == 8:
                cell.alignment = align_right
                cell.number_format = "0.00%"
            elif idx in (1, 2, 11):
                cell.alignment = align_center
            else:
                cell.alignment = align_left

    # Auto-adjust column widths for Sheet 1
    for col in ws1.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws1.column_dimensions[col_letter].width = max(max_len + 4, 12)

    # ==========================================
    # Sheet 2: To'lovlar Jadvali
    # ==========================================
    ws2 = wb.create_sheet(title="To'lovlar Jadvali")

    headers2 = [
        "Mashina",
        "Davlat raqami",
        "Haydovchi",
        "Oy tartibi",
        "To'lov sanasi",
        "Kutilgan summa ($)",
        "To'langan summa ($)",
        "Qolgan qarz ($)",
        "Holati",
        "Izoh",
    ]
    ws2.append(headers2)

    payments_qs = (
        Payment.objects.filter(contract__owner=owner)
        .select_related("contract__car", "contract__driver")
        .order_by("-contract__is_active", "contract_id", "month_number")
    )

    payment_status_map = {
        Payment.Status.PAID: "To'langan",
        Payment.Status.PARTIAL: "Qisman",
        Payment.Status.OVERDUE: "Muddati o'tgan",
        Payment.Status.PENDING: "Kutilmoqda",
        Payment.Status.CANCELLED: "Bekor qilingan",
    }

    for p in payments_qs:
        row2 = [
            p.contract.car.name,
            p.contract.car.plate_number,
            p.contract.driver.full_name,
            f"{p.month_number}-oy",
            str(p.due_date),
            float(p.expected_amount),
            float(p.paid_amount),
            float(p.remaining_amount),
            payment_status_map.get(p.status, p.status),
            p.comment or "—",
        ]
        ws2.append(row2)

    # Style Sheet 2
    for cell in ws2[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for row in ws2.iter_rows(min_row=2):
        for idx, cell in enumerate(row):
            cell.font = data_font
            cell.border = cell_border
            if idx in (5, 6, 7):
                cell.alignment = align_right
                cell.number_format = "$#,##0.00"
            elif idx in (1, 3, 4, 8):
                cell.alignment = align_center
            else:
                cell.alignment = align_left

    for col in ws2.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws2.column_dimensions[col_letter].width = max(max_len + 4, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def generate_single_contract_excel_report(contract: Contract) -> bytes:
    """
    Generates a single-contract Excel spreadsheet (.xlsx) in memory containing:
    1. Sheet 'Shartnoma va To\'lovlar':
       - Top Summary Block (Rows 1–12): Car, Driver, Dates, and Financial Breakdown.
       - Detailed Monthly Payment Schedule table (starting below Summary).
       - Totals footer row summing expected, paid, and remaining amounts.
    """
    car = contract.car
    driver = contract.driver
    payments = list(contract.payments.all().order_by("month_number"))

    wb = Workbook()
    ws = wb.active
    ws.title = "Shartnoma va To'lovlar"

    # Style constants
    primary_blue = "1E3A8A"
    header_fill = PatternFill(start_color=primary_blue, end_color=primary_blue, fill_type="solid")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color=primary_blue)
    section_font = Font(name="Calibri", size=11, bold=True, color=primary_blue)
    label_font = Font(name="Calibri", size=10, bold=True, color="334155")
    value_font = Font(name="Calibri", size=10, color="0F172A")
    data_font = Font(name="Calibri", size=10)
    bold_data_font = Font(name="Calibri", size=10, bold=True)

    border_thin = Side(border_style="thin", color="CBD5E1")
    cell_border = Border(top=border_thin, left=border_thin, right=border_thin, bottom=border_thin)

    totals_top = Side(border_style="thin", color="94A3B8")
    totals_bottom = Side(border_style="double", color="1E293B")
    totals_border = Border(top=totals_top, bottom=totals_bottom, left=border_thin, right=border_thin)
    totals_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    # ==========================================
    # Top Summary Block (Rows 1–12)
    # ==========================================
    # Row 1: Title
    ws.merge_cells("A1:H1")
    ws["A1"] = "SHARTNOMA BO'YICHA HISOBOT"
    ws["A1"].font = title_font
    ws["A1"].alignment = align_center
    ws.row_dimensions[1].height = 28

    # Row 2: Blank spacer
    ws.row_dimensions[2].height = 8

    # Row 3: Car details
    car_text = f"{car.name} ({car.plate_number})"
    if getattr(car, "year", None):
        car_text += f" | {car.year}-yil"
    if getattr(car, "notes", None):
        car_text += f" | {car.notes}"
    ws["A3"] = "Mashina:"
    ws["B3"] = car_text

    # Row 4: Driver details
    driver_text = f"{driver.full_name} | Telefon: {driver.phone}"
    if getattr(driver, "secondary_phone", None):
        driver_text += f" / {driver.secondary_phone}"
    ws["A4"] = "Mijoz / Haydovchi:"
    ws["B4"] = driver_text

    # Row 5: Contract dates & duration
    ws["A5"] = "Boshlangan sana:"
    ws["B5"] = (
        f"{contract.start_date} | Muddati: {contract.months_count} oy "
        f"(har oyning {contract.payment_day}-sanasida)"
    )

    # Row 6: Section label
    ws["A6"] = "Moliyaviy ko'rsatkichlar (USD):"
    ws["A6"].font = section_font

    # Financial rows (7-12)
    financial_items = [
        (7, "Mashina narxi:", float(contract.car_price), "$#,##0.00"),
        (8, "Boshlang'ich to'lov:", float(contract.initial_payment), "$#,##0.00"),
        (9, "Asosiy qarz (principal):", float(contract.principal_amount), "$#,##0.00"),
        (10, "Yillik ustama foiz:", f"{contract.annual_percent}%", None),
        (11, "Jami shartnoma summasi:", float(contract.total_amount), "$#,##0.00"),
        (12, "Har oylik to'lov:", float(contract.monthly_amount), "$#,##0.00"),
    ]

    for row_idx, label, val, num_fmt in financial_items:
        ws[f"A{row_idx}"] = label
        ws[f"B{row_idx}"] = val
        if num_fmt:
            ws[f"B{row_idx}"].number_format = num_fmt

    # Style summary rows 3-12
    for r in range(3, 13):
        cell_a = ws[f"A{r}"]
        cell_b = ws[f"B{r}"]
        if r != 6:
            cell_a.font = label_font
        cell_a.alignment = align_left
        cell_b.font = bold_data_font if r == 12 else value_font
        cell_b.alignment = align_left
        ws.row_dimensions[r].height = 19

    # Row 13: Blank spacer
    ws["A13"] = ""
    ws.row_dimensions[13].height = 10

    # ==========================================
    # Monthly Schedule Table (Starting row 14)
    # ==========================================
    headers = [
        "Oy (#)",
        "To'lov sanasi",
        "Kutilgan summa ($)",
        "To'langan summa ($)",
        "Qolgan qarz ($)",
        "Holati",
        "To'langan vaqti",
        "Izoh",
    ]
    header_row_idx = 14
    ws.row_dimensions[header_row_idx].height = 24
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=header_row_idx, column=col_idx, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center
        cell.border = cell_border

    payment_status_map = {
        Payment.Status.PAID: "To'langan",
        Payment.Status.PARTIAL: "Qisman",
        Payment.Status.OVERDUE: "Muddati o'tgan",
        Payment.Status.PENDING: "Kutilmoqda",
        Payment.Status.CANCELLED: "Bekor qilingan",
    }

    current_row = 15
    for p in payments:
        paid_at_str = (
            timezone.localtime(p.paid_at).strftime("%Y-%m-%d %H:%M")
            if p.paid_at
            else "—"
        )
        row_data = [
            f"{p.month_number}-oy",
            str(p.due_date),
            float(p.expected_amount),
            float(p.paid_amount),
            float(p.remaining_amount),
            payment_status_map.get(p.status, p.status),
            paid_at_str,
            p.comment or "—",
        ]
        for col_idx, val in enumerate(row_data, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = data_font
            cell.border = cell_border
            if col_idx in (3, 4, 5):
                cell.alignment = align_right
                cell.number_format = "$#,##0.00"
            elif col_idx in (1, 2, 6, 7):
                cell.alignment = align_center
            else:
                cell.alignment = align_left

        ws.row_dimensions[current_row].height = 20
        current_row += 1

    # Totals Row
    total_expected = sum((p.expected_amount for p in payments), Decimal("0.00"))
    total_paid = sum((p.paid_amount for p in payments), Decimal("0.00"))
    total_remaining = sum((p.remaining_amount for p in payments), Decimal("0.00"))

    totals_row = [
        "JAMI",
        "",
        float(total_expected),
        float(total_paid),
        float(total_remaining),
        "",
        "",
        "",
    ]
    for col_idx, val in enumerate(totals_row, start=1):
        cell = ws.cell(row=current_row, column=col_idx, value=val)
        cell.border = totals_border
        cell.fill = totals_fill
        cell.font = bold_data_font
        if col_idx in (3, 4, 5):
            cell.alignment = align_right
            cell.number_format = "$#,##0.00"
        elif col_idx == 1:
            cell.alignment = align_center
        else:
            cell.alignment = align_left

    ws.row_dimensions[current_row].height = 22

    # Auto-adjust column widths
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            # Skip merged title row
            if cell.row == 1:
                continue
            # Cap summary block Col B contribution to table layout
            val_str = str(cell.value or "")
            length = len(val_str)
            if cell.row < 14 and cell.column == 2:
                length = min(length, 25)
            if length > max_len:
                max_len = length
        ws.column_dimensions[col_letter].width = max(max_len + 4, 13)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()
