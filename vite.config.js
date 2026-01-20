import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Helper to resolve paths
const SONGS_DIR = path.resolve(__dirname, 'songs');
const OUTPUT_DIR = path.resolve(__dirname, 'output');

/**
 * Custom Vite Plugin to provide a simple API for:
 * - Listing songs
 * - Reading/Saving/Deleting songs
 * - Saving baked JSON files
 */
const apiPlugin = () => ({
  name: 'strudel-baker-api',
  configureServer(server) {
    
    // API: List Songs
    // GET /api/songs
    server.middlewares.use('/api/songs', (req, res, next) => {
      if (req.method === 'GET' && req.url === '/') {
        try {
            if (!fs.existsSync(SONGS_DIR)) {
                fs.mkdirSync(SONGS_DIR, { recursive: true });
            }
            const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(files));
        } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }
      next();
    });

    // API: Manage Song
    // GET/POST/DELETE /api/song/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/song/')) {
            return next();
        }
        
        const songName = req.url.replace('/api/song/', '');
        // Basic security: prevent escaping directory
        if (songName.includes('..') || !songName.endsWith('.js')) {
            res.statusCode = 400;
            res.end('Invalid filename');
            return;
        }

        const filePath = path.join(SONGS_DIR, songName);

        // GET - Read song content
        if (req.method === 'GET') {
             if (fs.existsSync(filePath)) {
                 res.setHeader('Content-Type', 'text/plain');
                 res.end(fs.readFileSync(filePath, 'utf-8'));
             } else {
                 res.statusCode = 404;
                 res.end('Not found');
             }
             return;
        }
        
        // POST - Save song content
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                fs.writeFileSync(filePath, body);
                res.end('Saved');
            });
            return;
        }

        // DELETE - Delete song
        if (req.method === 'DELETE') {
             if (fs.existsSync(filePath)) {
                 fs.unlinkSync(filePath);
                 res.end('Deleted');
             } else {
                 res.statusCode = 404;
                 res.end('Not found');
             }
             return;
        }
        
        next();
    });
    
    // API: Save Baked JSON
    // POST /api/save-baked/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/save-baked/')) {
            return next();
        }
        const fileName = req.url.replace('/api/save-baked/', '');
        
        if (fileName.includes('..') || !fileName.endsWith('.json')) {
             res.statusCode = 400;
             res.end('Invalid filename (must be .json)');
             return;
        }

        const filePath = path.join(OUTPUT_DIR, fileName);
        
        if (req.method === 'POST') {
             let body = '';
             req.on('data', chunk => body += chunk);
             req.on('end', () => {
                 if (!fs.existsSync(path.dirname(filePath))) {
                     fs.mkdirSync(path.dirname(filePath), { recursive: true });
                 }
                 fs.writeFileSync(filePath, body);
                 res.end('Baked file saved');
             });
             return;
        }
        
        next();
     });
  }
});

export default defineConfig({
  plugins: [apiPlugin()],
  // Ensure we can import from src/
  resolve: {
    dedupe: [
        '@strudel/core', 
        '@strudel/web', 
        '@strudel/repl',
        '@strudel/webaudio',
        '@strudel/transpiler',
        '@strudel/codemirror',
        '@strudel/draw',
        '@strudel/mini'
    ],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@strudel/core': path.resolve(__dirname, 'node_modules/@strudel/core'),
      '@strudel/webaudio': path.resolve(__dirname, 'node_modules/@strudel/webaudio'),
      '@strudel/repl': path.resolve(__dirname, 'node_modules/@strudel/repl')
    }
  },
  server: {
    port: 5173,
    strictPort: false, // Allow using next available port if 5173 is taken
    host: true, // Listen on all network interfaces for better accessibility
    watch: {
      ignored: ['**/songs/**', '**/output/**']
    }
  }
});
