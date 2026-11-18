from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("rooms", views.RoomViewSet, basename="room")
router.register("guests", views.GuestViewSet, basename="guest")
router.register("reservations", views.ReservationViewSet, basename="reservation")
router.register("catalog", views.CatalogItemViewSet, basename="catalog")
router.register("consumptions", views.ConsumptionViewSet, basename="consumption")
router.register("orders", views.OrderViewSet, basename="order")

urlpatterns = [
    # Autenticação
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    # Painel admin
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    # App do hóspede
    path("me/stay/", views.MyStayView.as_view(), name="my-stay"),
    path("me/orders/", views.MyOrdersView.as_view(), name="my-orders"),
    path("me/orders/<int:pk>/cancel/", views.MyOrderCancelView.as_view(), name="my-order-cancel"),
    path("", include(router.urls)),
]
