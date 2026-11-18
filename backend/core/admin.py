from django.contrib import admin

from .models import ActivityLog, CatalogItem, Consumption, Guest, Reservation, Room, ServiceRequest


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category", "capacity", "nightly_rate", "status", "is_active")
    list_filter = ("status", "category", "is_active")
    list_editable = ("status",)


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ("full_name", "phone", "profile", "user")
    search_fields = ("full_name", "phone", "document", "user__email")


class ConsumptionInline(admin.TabularInline):
    model = Consumption
    extra = 0
    fields = ("description", "quantity", "unit_price", "status", "photo")


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("code", "guest", "room", "check_in_date", "check_out_date", "status")
    list_filter = ("status", "room")
    search_fields = ("code", "guest__full_name")
    inlines = [ConsumptionInline]


@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "request_type", "price", "is_active", "available_for_guests")
    list_filter = ("category", "request_type", "is_active")
    list_editable = ("price", "is_active", "available_for_guests")


@admin.register(Consumption)
class ConsumptionAdmin(admin.ModelAdmin):
    list_display = ("description", "reservation", "quantity", "unit_price", "status", "created_at")
    list_filter = ("status", "category")


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "request_type", "reservation", "status", "created_at")
    list_filter = ("status", "request_type")


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "reservation", "kind", "message", "amount")
    list_filter = ("kind",)
