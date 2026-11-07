const { exec } = require('child_process');

function scegliCartellaNativa() {
  return new Promise((resolve, reject) => {
    let comando = '';

    if (process.platform === 'win32') {
      // Comando PowerShell per Windows
      comando = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Seleziona la cartella di destinazione'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }"`;
    } else if (process.platform === 'darwin') {
      // Comando AppleScript per macOS
      comando = `osascript -e 'POSIX path of (choose folder with prompt "Seleziona la cartella di destinazione")'`;
    } else {
      // Comando Zenity per Linux (Ubuntu/Debian)
      comando = `zenity --file-selection --directory --title="Seleziona la cartella"`;
    }

    exec(comando, (errore, stdout) => {
      if (errore) {
        return reject('Errore durante l\'apertura della finestra');
      }
      const percorso = stdout.trim();
      if (!percorso) {
        return reject('Nessuna cartella selezionata (operazione annullata)');
      }
      resolve(percorso);
    });
  });
}

module.exports={scegliCartellaNativa}
// Esempio di utilizzo:
/*
scegliCartellaNativa()
  .then(percorso => console.log('Cartella scelta:', percorso))
  .catch(err => console.log(err));
*/