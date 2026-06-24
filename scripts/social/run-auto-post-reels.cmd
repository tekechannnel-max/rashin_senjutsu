@echo off
setlocal
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || exit /b 1
if not exist logs mkdir logs
set "PATH=D:\Git\cmd;D:\;%PATH%"
set "SOCIAL_AUTOMATED_POSTING_ENABLED=true"
call D:\npm.cmd run social:run-due -- --only-kind=birthday_reel >> "logs\social-auto-post-approved-reels.log" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
