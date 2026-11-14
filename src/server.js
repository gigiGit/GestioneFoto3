
import express from 'express';
import path from 'path';

import { fileURLToPath } from 'url';

// Ricostruzione di __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File statici
app.use(express.static(path.join(__dirname, 'public')));

// API
import apiRoutes, { initializeArchiveCache } from './routes/api.js';
app.use('/api', apiRoutes);

// Pagina principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestione errori 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Risorsa non trovata'
    });
});

// Carica gli archivi prima di accettare richieste
//await initializeArchiveCache();

// Avvio server
app.listen(PORT, () => {
    console.log(`Server avviato su http://localhost:${PORT}`);
});
