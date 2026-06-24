@echo off
setlocal
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || exit /b 1
if not exist logs mkdir logs
set "PATH=D:\Git\cmd;D:\;%PATH%"
call D:\npm.cmd run social:auto-prepare-reels -- --days-ahead=1 --auto-approve --publish-to-git >> "logs\social-auto-prepare-approved-reels.log" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
