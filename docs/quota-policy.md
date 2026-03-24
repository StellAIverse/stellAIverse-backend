Schema: fields (scope, targetId, limit, windowMs, burst)

Endpoints: CRUD + preview

Examples:

curl -X POST /quota/policies \
  -H "Authorization: Bearer <token>" \
  -d '{"scope":"USER","targetId":"123","limit":100,"windowMs":60000,"burst":20}'

Dry-run usage

Audit logs explanation