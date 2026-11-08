from django.urls import path

from apps.fleet.views import (
    CarDetailAPIView,
    CarListCreateAPIView,
    ClientMyContractsAPIView,
    ContractCalculateAPIView,
    ContractCloseAPIView,
    ContractDetailAPIView,
    ContractListCreateAPIView,
    DashboardAPIView,
    DriverDetailAPIView,
    DriverListCreateAPIView,
    ExportExcelAPIView,
    OverduePaymentsAPIView,
    PaymentPayAPIView,
)

urlpatterns = [
    # Dashboard
    path("dashboard/", DashboardAPIView.as_view(), name="fleet-dashboard"),

    # Excel Export
    path("export/excel/", ExportExcelAPIView.as_view(), name="fleet-export-excel"),

    # Cars
    path("cars/", CarListCreateAPIView.as_view(), name="fleet-cars-list-create"),
    path("cars/<int:pk>/", CarDetailAPIView.as_view(), name="fleet-car-detail"),

    # Drivers
    path("drivers/", DriverListCreateAPIView.as_view(), name="fleet-drivers-list-create"),
    path("drivers/<int:pk>/", DriverDetailAPIView.as_view(), name="fleet-driver-detail"),

    # Contracts
    path("contracts/calculate/", ContractCalculateAPIView.as_view(), name="fleet-contract-calculate"),
    path("contracts/", ContractListCreateAPIView.as_view(), name="fleet-contracts-list-create"),
    path("contracts/<int:pk>/", ContractDetailAPIView.as_view(), name="fleet-contract-detail"),
    path("contracts/<int:pk>/close/", ContractCloseAPIView.as_view(), name="fleet-contract-close"),

    # Payments
    path("payments/overdue/", OverduePaymentsAPIView.as_view(), name="fleet-payments-overdue"),
    path("payments/<int:pk>/pay/", PaymentPayAPIView.as_view(), name="fleet-payment-pay"),

    # Client (Driver) Read-only Portal
    path("client/my-contracts/", ClientMyContractsAPIView.as_view(), name="client-my-contracts"),
]
