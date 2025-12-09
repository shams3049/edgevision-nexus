#!/bin/bash
# Documentation Policy Checker
# Ensures only README.md exists in project

set -e

echo "🔍 Checking documentation policy..."
echo ""

# Find all markdown files except allowed ones
MARKDOWN_FILES=$(find . -name "*.md" \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -path "./README.md" \
    ! -path "./.github/*.md" \
    -type f)

if [ -z "$MARKDOWN_FILES" ]; then
    echo "✅ PASS: Only README.md exists"
    echo ""
    echo "Allowed documentation files:"
    echo "  ✓ README.md (326 lines)"
    echo "  ✓ .github/pull_request_template.md (GitHub template)"
    echo ""
    exit 0
else
    echo "❌ FAIL: Found unauthorized markdown files:"
    echo ""
    echo "$MARKDOWN_FILES" | sed 's/^/  - /'
    echo ""
    echo "Action required:"
    echo "  1. Move content to README.md"
    echo "  2. Remove these files"
    echo "  3. Re-run this check"
    echo ""
    exit 1
fi
