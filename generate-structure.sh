#!/bin/bash

# Clean display of src folder structure
echo "📁 NESTJS PROJECT STRUCTURE"
echo "============================"
echo ""

# Show directories with proper tree formatting
echo "📂 DIRECTORIES:"
echo "--------------"
find src -type d | sort | while read dir; do
    # Count depth for indentation
    depth=$(echo "$dir" | tr -cd '/' | wc -c)
    indent=$(printf "%${depth}s" "" | tr ' ' '  ')

    # Get folder name
    folder_name=$(basename "$dir")

    # Skip root src in display
    if [ "$dir" != "src" ]; then
        # Check if this is last item at this depth
        parent=$(dirname "$dir")
        siblings=$(find "$parent" -maxdepth 1 -type d | sort)
        last_sibling=$(echo "$siblings" | tail -1)

        if [ "$dir" = "$last_sibling" ]; then
            echo "${indent}└── $folder_name"
        else
            echo "${indent}├── $folder_name"
        fi
    fi
done

echo ""
echo "📄 MAIN FILES:"
echo "-------------"
ls -la src/*.ts 2>/dev/null | grep -E "\.(ts|js)$" | grep -v ".spec.ts" | while read file; do
    echo "├── $(basename "$file")"
done

echo ""
echo "🏗️  MODULES:"
echo "-----------"
find src -name "*.module.ts" -not -path "*/node_modules/*" | sort | while read module; do
    module_name=$(basename "$module" .module.ts)
    echo "├── $module_name.module.ts"
done

echo ""
echo "🎯 CONTROLLERS:"
echo "---------------"
find src -name "*.controller.ts" -not -path "*/node_modules/*" | sort | while read controller; do
    controller_name=$(basename "$controller" .controller.ts)
    echo "├── $controller_name.controller.ts"
done

echo ""
echo "⚙️ SERVICES:"
echo "-----------"
find src -name "*.service.ts" -not -path "*/node_modules/*" | sort | while read service; do
    service_name=$(basename "$service" .service.ts)
    echo "├── $service_name.service.ts"
done

echo ""
echo "📊 SUMMARY:"
echo "----------"
echo "📂 Directories: $(find src -type d | wc -l)"
echo "📄 TypeScript files: $(find src -name "*.ts" | grep -v ".spec.ts" | wc -l)"
echo "📦 Modules: $(find src -name "*.module.ts" | wc -l)"
echo "🎯 Controllers: $(find src -name "*.controller.ts" | wc -l)"
echo "⚙️ Services: $(find src -name "*.service.ts" | wc -l)"
echo "📝 DTOs: $(find src -name "*.dto.ts" | wc -l)"
echo "🏛️ Entities: $(find src -name "*.entity.ts" | wc -l)"
echo "🛡️ Guards: $(find src -name "*.guard.ts" | wc -l)"