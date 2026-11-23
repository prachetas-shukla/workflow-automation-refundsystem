@REM ----------------------------------------------------------------------------
@REM Licensed to the Apache Software Foundation (ASF)
@REM Maven Wrapper start up batch script for Windows
@REM ----------------------------------------------------------------------------

@IF "%__MVNW_ARG0_DONE%"=="" (
  @SET __MVNW_ARG0_DONE=true
  @SETLOCAL
  @SET __MVNW_CMD_LINE=%~dp0mvnw.cmd %*
  @CMD /S /C "%__MVNW_CMD_LINE%"
  @ENDLOCAL & @SET ERROR_CODE=%ERRORLEVEL%
  @EXIT /B %ERROR_CODE%
)
@SETLOCAL

@SET WRAPPER_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain

@SET MAVEN_PROJECTBASEDIR=%~dp0
@SET WRAPPER_JAR="%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar"
@SET WRAPPER_PROPERTIES="%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.properties"

@SET DOWNLOAD_URL=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar
@SET WRAPPER_JAR_UNQUOTED=%WRAPPER_JAR:"=%

@IF NOT EXIST "%WRAPPER_JAR_UNQUOTED%" (
  @ECHO Downloading Maven Wrapper...
  powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%WRAPPER_JAR_UNQUOTED%' }"
  @IF NOT EXIST "%WRAPPER_JAR_UNQUOTED%" (
    @ECHO ERROR: Failed to download Maven Wrapper jar
    @EXIT /B 1
  )
)

@SET MAVEN_JAVA_EXE=java
@IF DEFINED JAVA_HOME @SET MAVEN_JAVA_EXE="%JAVA_HOME%\bin\java.exe"

%MAVEN_JAVA_EXE% ^
  %MAVEN_OPTS% ^
  -classpath %WRAPPER_JAR% ^
  %WRAPPER_LAUNCHER% %*

@ENDLOCAL & @SET ERROR_CODE=%ERRORLEVEL%
@EXIT /B %ERROR_CODE%
