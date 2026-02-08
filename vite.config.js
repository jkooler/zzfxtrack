import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import tailwindcss from '@tailwindcss/vite';

// Helper to resolve paths
const SONGS_DIR = path.resolve(__dirname, 'songs');
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const BLOCKS_DIR = path.resolve(__dirname, 'blocks');

/**
 * Custom Vite Plugin to provide a simple API for:
 * - Listing songs
 * - Reading/Saving/Deleting songs
 * - Saving baked JSON files
 * - Managing blocks (reusable patterns)
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
                 const metaPath = path.join(SONGS_DIR, songName.replace(/\.js$/, '.meta.json'));
                 if (fs.existsSync(metaPath)) {
                     fs.unlinkSync(metaPath);
                 }
                 res.end('Deleted');
             } else {
                 res.statusCode = 404;
                 res.end('Not found');
             }
             return;
        }
        
        next();
    });

    // API: Song metadata
    // GET/POST/DELETE /api/song-meta/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/song-meta/')) {
            return next();
        }

        const songName = req.url.replace('/api/song-meta/', '');
        if (songName.includes('..') || !songName.endsWith('.js')) {
            res.statusCode = 400;
            res.end('Invalid filename');
            return;
        }

        const metaPath = path.join(SONGS_DIR, songName.replace(/\.js$/, '.meta.json'));

        if (req.method === 'GET') {
            if (fs.existsSync(metaPath)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(fs.readFileSync(metaPath, 'utf-8'));
            } else {
                res.statusCode = 404;
                res.end('Not found');
            }
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    if (!fs.existsSync(SONGS_DIR)) {
                        fs.mkdirSync(SONGS_DIR, { recursive: true });
                    }
                    fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));
                    res.end('Saved');
                } catch (e) {
                    res.statusCode = 400;
                    res.end('Invalid JSON');
                }
            });
            return;
        }

        if (req.method === 'DELETE') {
            if (fs.existsSync(metaPath)) {
                fs.unlinkSync(metaPath);
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
     
     // API: Rename Song
     // POST /api/rename-song
     server.middlewares.use('/api/rename-song', (req, res, next) => {
       if (req.method === 'POST') {
         let body = '';
         req.on('data', chunk => body += chunk);
         req.on('end', () => {
           try {
             const { oldName, newName } = JSON.parse(body);
             
             // Validate filenames
             if (!oldName || !newName || 
                 oldName.includes('..') || newName.includes('..') ||
                 !oldName.endsWith('.js') || !newName.endsWith('.js')) {
               res.statusCode = 400;
               res.end('Invalid filename');
               return;
             }
             
             const oldPath = path.join(SONGS_DIR, oldName);
             const newPath = path.join(SONGS_DIR, newName);
             
             // Check if old file exists
             if (!fs.existsSync(oldPath)) {
               res.statusCode = 404;
               res.end('Song not found');
               return;
             }
             
             // Check if new name already exists
             if (fs.existsSync(newPath) && oldPath !== newPath) {
               res.statusCode = 409;
               res.end('A song with that name already exists');
               return;
             }
             
             // Rename the file
             fs.renameSync(oldPath, newPath);
             
             console.log(`[API] Renamed song: ${oldName} -> ${newName}`);
             res.end('Song renamed successfully');
             
           } catch (e) {
             console.error('[API] Rename error:', e);
             res.statusCode = 500;
             res.end(`Error renaming song: ${e.message}`);
           }
         });
         return;
       }
       next();
     });

     // API: List Blocks
     // GET /api/blocks
     server.middlewares.use('/api/blocks', (req, res, next) => {
       if (req.method === 'GET' && req.url === '/') {
         try {
           if (!fs.existsSync(BLOCKS_DIR)) {
             fs.mkdirSync(BLOCKS_DIR, { recursive: true });
           }
           
           const files = fs.readdirSync(BLOCKS_DIR)
             .filter(f => f.endsWith('.js') && f !== 'index.js');
           
            // Read metadata from each block file
            const blocks = files.map(filename => {
              const filePath = path.join(BLOCKS_DIR, filename);
              try {
                const content = fs.readFileSync(filePath, 'utf-8');
                // Extract name, description, and pattern from exports
                const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
                const descMatch = content.match(/export\s+const\s+description\s*=\s*["']([^"']*)["']/);
                // Pattern can be in backticks, single quotes, or double quotes
                const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*[`"']([\s\S]*?)[`"'];?\s*$/m);
                // Extract trackerState if present
                const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\});?\s*$/m);
                let trackerState = null;
                if (trackerStateMatch) {
                  try {
                    trackerState = JSON.parse(trackerStateMatch[1]);
                  } catch (e) {
                    // Invalid JSON, ignore
                  }
                }
                
                return {
                  filename,
                  name: nameMatch ? nameMatch[1] : filename.replace('.js', ''),
                  description: descMatch ? descMatch[1] : '',
                  pattern: patternMatch ? patternMatch[1].trim() : '',
                  trackerState
                };
              } catch (e) {
                return { filename, name: filename.replace('.js', ''), description: '', pattern: '', trackerState: null };
              }
            });
           
           res.setHeader('Content-Type', 'application/json');
           res.end(JSON.stringify(blocks));
         } catch (e) {
           res.statusCode = 500;
           res.end(JSON.stringify({ error: e.message }));
         }
         return;
       }
       
       // POST /api/blocks - Create new block
       if (req.method === 'POST' && req.url === '/') {
         let body = '';
         req.on('data', chunk => body += chunk);
         req.on('end', () => {
           try {
             const blockData = JSON.parse(body);
             const { filename, name, description, pattern, trackerState } = blockData;
             
             // Validate filename
             if (!filename || filename.includes('..') || !filename.endsWith('.js')) {
               res.statusCode = 400;
               res.end('Invalid filename');
               return;
             }
             
             if (!fs.existsSync(BLOCKS_DIR)) {
               fs.mkdirSync(BLOCKS_DIR, { recursive: true });
             }
             
             const filePath = path.join(BLOCKS_DIR, filename);
             
             // Generate block file content
             const fileContent = `// Block: ${name}
// ${description || 'No description'}

export const name = "${name}";
export const description = "${description || ''}";

export const pattern = \`${pattern}\`;

// Optional: Tracker state for re-editing
export const trackerState = ${JSON.stringify(trackerState, null, 2)};
`;
             
             fs.writeFileSync(filePath, fileContent);
             console.log(`[API] Created block: ${filename}`);
             res.end('Block created successfully');
           } catch (e) {
             console.error('[API] Create block error:', e);
             res.statusCode = 500;
             res.end(`Error creating block: ${e.message}`);
           }
         });
         return;
       }
       
       next();
     });

      // API: Get/Delete/Update Block
      // GET /api/blocks/:filename
      // DELETE /api/blocks/:filename
      // PUT /api/blocks/:filename
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/blocks/')) {
          return next();
        }
        
        const filename = req.url.replace('/api/blocks/', '');
        
        // Validate filename for all operations
        if (!filename || filename.includes('..') || !filename.endsWith('.js')) {
          res.statusCode = 400;
          res.end('Invalid filename');
          return;
        }
        
        const filePath = path.join(BLOCKS_DIR, filename);
        
        // GET - Return full block data including trackerState
        if (req.method === 'GET') {
          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              // Extract all exports
              const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
              const descMatch = content.match(/export\s+const\s+description\s*=\s*["']([^"']*)["']/);
              const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*[`"']([\s\S]*?)[`"'];?\s*$/m);
              const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\});?\s*$/m);
              
              let trackerState = null;
              if (trackerStateMatch) {
                try {
                  trackerState = JSON.parse(trackerStateMatch[1]);
                } catch (e) {
                  // Invalid JSON, ignore
                }
              }
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                filename,
                name: nameMatch ? nameMatch[1] : filename.replace('.js', ''),
                description: descMatch ? descMatch[1] : '',
                pattern: patternMatch ? patternMatch[1].trim() : '',
                trackerState
              }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          } else {
            res.statusCode = 404;
            res.end('Block not found');
          }
          return;
        }
        
        if (req.method === 'DELETE') {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[API] Deleted block: ${filename}`);
            res.end('Block deleted successfully');
          } else {
            res.statusCode = 404;
            res.end('Block not found');
          }
          return;
        }
        
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const blockData = JSON.parse(body);
              const { name, description, pattern, trackerState } = blockData;
              
              if (!fs.existsSync(BLOCKS_DIR)) {
                fs.mkdirSync(BLOCKS_DIR, { recursive: true });
              }
              
              // Generate block file content
              const fileContent = `// Block: ${name}
// ${description || 'No description'}

export const name = "${name}";
export const description = "${description || ''}";

export const pattern = \`${pattern}\`;

// Optional: Tracker state for re-editing
export const trackerState = ${JSON.stringify(trackerState, null, 2)};
`;
              
              fs.writeFileSync(filePath, fileContent);
              console.log(`[API] Updated block: ${filename}`);
              res.end('Block updated successfully');
            } catch (e) {
              console.error('[API] Update block error:', e);
              res.statusCode = 500;
              res.end(`Error updating block: ${e.message}`);
            }
          });
          return;
        }
        
        next();
      });
  }
});

// Add update-instruments endpoint
const updateInstrumentsPlugin = () => ({
  name: 'update-instruments-api',
  configureServer(server) {
    server.middlewares.use('/api/instruments', async (req, res, next) => {
      if (req.method !== 'GET') {
        return next();
      }

      const filePath = path.resolve(__dirname, 'instruments.js');

      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end();
        return;
      }

      try {
        const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
        const moduleData = await import(moduleUrl);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          instruments: moduleData.instruments || {},
          instrumentMapping: moduleData.instrumentMapping || {},
          instrumentArray: moduleData.instrumentArray || []
        }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    server.middlewares.use('/api/update-instruments', (req, res, next) => {
      if (req.method === 'POST') {
        const filePath = path.resolve(__dirname, 'instruments.js');
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            fs.writeFileSync(filePath, body);
            console.log('[API] Updated instruments.js');
            res.end('instruments.js updated');
          } catch (e) {
            res.statusCode = 500;
            res.end(`Error writing instruments.js: ${e.message}`);
          }
        });
        return;
      }
      next();
    });
  }
});

export default defineConfig({
  plugins: [tailwindcss(), apiPlugin(), updateInstrumentsPlugin()],
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
      '@strudel/repl': path.resolve(__dirname, 'node_modules/@strudel/repl'),
      'lucide': path.resolve(__dirname, 'node_modules/lucide/dist/esm/lucide/src/lucide.js')
    }
  },
  server: {
    port: 5173,
    strictPort: false, // Allow using next available port if 5173 is taken
    host: true, // Listen on all network interfaces for better accessibility
    watch: {
      ignored: ['**/songs/**', '**/output/**', '**/instruments.js', '**/blocks/**']
    }
  }
});
