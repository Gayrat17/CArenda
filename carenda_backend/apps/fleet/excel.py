import io
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
