@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo 찬양팀 악보 - 처음 열 때 묻는 비밀번호 바꾸기
echo.
node tools\set-password.mjs
echo.
pause
