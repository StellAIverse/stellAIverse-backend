#!/bin/bash
echo "=== Testing Monitoring Stack ==="

echo "1. Checking Docker services..."
docker-compose ps | grep -E "(Up|Healthy)"

echo -e "\n2. Testing Prometheus..."
if curl -s http://localhost:9090 > /dev/null; then
  echo "✅ Prometheus UI accessible"
  # Check targets
  TARGETS=$(curl -s "http://localhost:9090/api/v1/targets" | jq -r '.data.activeTargets[] | select(.labels.job=="stellai-backend") | .health')
  if [ "$TARGETS" = "up" ]; then
    echo "✅ Prometheus scraping stellAIverse-backend"
  else
    echo "❌ Prometheus not scraping stellAIverse-backend"
  fi
else
  echo "❌ Prometheus not accessible"
fi

echo -e "\n3. Testing Grafana..."
if curl -s http://localhost:3001 > /dev/null; then
  echo "✅ Grafana UI accessible"
  # Check data sources
  if curl -s http://admin:admin@localhost:3001/api/datasources | grep -q "prometheus"; then
    echo "✅ Prometheus datasource configured"
  else
    echo "⚠️  Prometheus datasource not found"
  fi
else
  echo "❌ Grafana not accessible"
fi

echo -e "\n4. Testing Jaeger..."
if curl -s http://localhost:16686 > /dev/null; then
  echo "✅ Jaeger UI accessible"
  # Check services
  SERVICES=$(curl -s http://localhost:16686/api/services | jq -r '.[]')
  if echo "$SERVICES" | grep -q "stellAIverse-backend"; then
    echo "✅ stellAIverse-backend registered in Jaeger"
  else
    echo "⚠️  stellAIverse-backend not in Jaeger"
  fi
else
  echo "❌ Jaeger not accessible"
fi

echo -e "\n5. Testing Application Metrics..."
if curl -s http://localhost:3000/api/v1/metrics | grep -q "stellaiverse_"; then
  echo "✅ Application metrics endpoint working"
  METRIC_COUNT=$(curl -s http://localhost:3000/api/v1/metrics | grep -c "stellaiverse_")
  echo "   Found $METRIC_COUNT stellaiverse metrics"
else
  echo "❌ Application metrics endpoint not working"
fi

echo -e "\n=== Summary ==="
echo "Prometheus:  http://localhost:9090"
echo "Grafana:     http://localhost:3001 (admin/admin)"
echo "Jaeger:      http://localhost:16686"
echo "App API:     http://localhost:3000/api/v1"
echo "App Metrics: http://localhost:3000/api/v1/metrics"
