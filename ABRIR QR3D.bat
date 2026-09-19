@echo off
title QR3D - puerto 8020
echo.
echo   QR3D (generador de QR 3D)  .......  http://localhost:8020
echo.
echo   Para APAGAR: cierra esta ventana o pulsa Ctrl+C
echo.
start "" http://localhost:8020
python -m http.server 8020 --directory "D:\user kiro\Escritorio\INVERSIONES\PROGRAMAS IA\micro saas\qr3d"
pause
