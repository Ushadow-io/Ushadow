
# ============================================
# Ushadow stage (appended by scripts/build-push-images.sh)
# ============================================
# Upstream's prod image relies on docker-compose bind mounts for the
# chronicle-root files below (backend/docker-compose.yml). Kubernetes has no
# such mounts, so bake them in. The script builds with
#   --build-context chronicle_root=chronicle --target ushadow-prod
FROM prod AS ushadow-prod
COPY --from=chronicle_root discovery.py /app/discovery.py
COPY --from=chronicle_root plugins /app/plugins
RUN find /app/plugins -name __pycache__ -prune -exec rm -rf {} +
