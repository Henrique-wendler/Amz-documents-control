; Release identity is supplied from amazon_agro/version.py by build_windows.ps1.
#ifndef AppVersion
  #error Use scripts/build_windows.ps1 to supply the canonical release identity.
#endif
#ifndef DistDir
  #error DistDir is required.
#endif
#ifndef InstallerOutput
  #error InstallerOutput is required.
#endif
#ifndef InstallerSuffix
  #define InstallerSuffix ""
#endif

[Setup]
AppId={#InstallerAppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#Publisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#ExeName}.exe
OutputDir={#InstallerOutput}
OutputBaseFilename={#ExeName}-Setup-{#AppVersion}{#InstallerSuffix}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousTasks=yes
CloseApplications=yes
RestartApplications=no
AppMutex=AmazonAgroPropostasRelease
#ifdef AppIcon
SetupIconFile={#AppIcon}
#endif

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#ExeName}.exe"; WorkingDir: "{app}"; IconFilename: "{app}\{#ExeName}.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#ExeName}.exe"; WorkingDir: "{app}"; IconFilename: "{app}\{#ExeName}.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\{#ExeName}.exe"; Description: "Abrir {#AppName}"; Flags: nowait postinstall skipifsilent

; No [UninstallDelete]: LOCALAPPDATA user work must survive uninstall/upgrade.
