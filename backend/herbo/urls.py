from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Hotel Herbo — Administração"
admin.site.site_title = "Hotel Herbo"
admin.site.index_title = "Glamping com serviço de hotel"

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include("core.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
