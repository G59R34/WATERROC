#!/bin/bash

# Waterstream Launch Script
# This script opens the application in your default browser

echo "🌊 Launching Waterstream Employee Management System..."
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Open in default browser
if command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "$SCRIPT_DIR/index.html"
elif command -v open &> /dev/null; then
    # macOS
    open "$SCRIPT_DIR/index.html"
elif command -v start &> /dev/null; then
    # Windows
    start "$SCRIPT_DIR/index.html"
else
    echo "Please open index.html in your web browser manually"
    echo "Location: $SCRIPT_DIR/index.html"
fi

echo ""
echo "✅ Application should open in your browser"
echo ""
echo "Demo Credentials:"
echo "  Admin:    username: admin    password: admin123"
echo "  Employee: username: employee password: emp123"
echo ""
