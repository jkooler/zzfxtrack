import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import tailwindcss from '@tailwindcss/vite';

// Helper to resolve paths
const PATTERNS_DIR = path.resolve(__dirname, 'patterns');
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const BLOCKS_DIR = path.resolve(__dirname, 'blocks');
const ARRANGEMENTS_DIR = path.resolve(__dirname, 'arrangements');
const VALID_SCOPES = new Set(['user', 'system']);

function normalizeScope(value, fallback = 'user') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return VALID_SCOPES.has(normalized) ? normalized : fallback;
}

function readScopeFromContent(content, fallback = 'user') {
  if (typeof content !== 'string') return fallback;
  const scopeMatch = content.match(/export\s+const\s+scope\s*=\s*["']([^"']+)["']\s*;?/);
  return normalizeScope(scopeMatch ? scopeMatch[1] : null, fallback);
}

function patternMetaPath(patternFilename) {
  return path.join(PATTERNS_DIR, patternFilename.replace(/\.js$/, '.meta.json'));
}

function readPatternScope(patternFilename) {
  try {
    const metaPath = patternMetaPath(patternFilename);
    if (!fs.existsSync(metaPath)) return 'user';
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    return normalizeScope(parsed?.scope, 'user');
  } catch (_e) {
    return 'user';
  }
}

/**
 * Custom Vite Plugin to provide a simple API for:
 * - Listing patterns (Strudel files)
 * - Reading/Saving/Deleting patterns
 * - Saving exported JSON files
 * - Managing blocks (reusable patterns)
 */
const apiPlugin = () => ({
  name: 'strudel-export-api',
  configureServer(server) {
    const isDeveloperModeRequest = (req) => {
      try {
        return String(req?.headers?.['x-developer-mode'] || '') === '1';
      } catch (_e) {
        return false;
      }
    };

    const getArrangementsUsingBlock = (targetFilename) => {
      if (!targetFilename || !fs.existsSync(ARRANGEMENTS_DIR)) return [];
      const arrangementFiles = fs.readdirSync(ARRANGEMENTS_DIR)
        .filter((filename) => filename.endsWith('.js') && filename !== 'index.js');
      const usedBy = [];

      arrangementFiles.forEach((arrangementFilename) => {
        const filePath = path.join(ARRANGEMENTS_DIR, arrangementFilename);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
          const arrangementStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
          if (!arrangementStateMatch) return;

          const arrangementState = JSON.parse(arrangementStateMatch[1]);
          const rows = Array.isArray(arrangementState?.rows) ? arrangementState.rows : [];
          const hasReference = rows.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(targetFilename));
          if (!hasReference) return;

          usedBy.push({
            filename: arrangementFilename,
            name: nameMatch ? nameMatch[1] : arrangementFilename.replace('.js', ''),
            scope: readScopeFromContent(content, 'user'),
          });
        } catch (_e) {
          // Ignore malformed arrangement files and continue scanning.
        }
      });

      return usedBy;
    };
    
    // API: List Patterns (Strudel files)
    // GET /api/patterns
    server.middlewares.use('/api/patterns', (req, res, next) => {
      if (req.method === 'GET' && req.url === '/') {
        try {
            if (!fs.existsSync(PATTERNS_DIR)) {
                fs.mkdirSync(PATTERNS_DIR, { recursive: true });
            }
            const files = fs.readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');
            const patterns = files.map((filename) => ({
                filename,
                scope: readPatternScope(filename),
            }));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(patterns));
        } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }
      next();
    });

    // API: Manage Pattern (Strudel file)
    // GET/POST/DELETE /api/pattern/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/pattern/')) {
            return next();
        }
        
        const patternNameRaw = req.url.replace('/api/pattern/', '');
        let patternName = patternNameRaw;
        try {
            patternName = decodeURIComponent(patternNameRaw);
        } catch (e) {
            res.statusCode = 400;
            res.end('Invalid filename encoding');
            return;
        }
        // Basic security: prevent escaping directory
        if (patternName.includes('..') || !patternName.endsWith('.js')) {
            res.statusCode = 400;
            res.end('Invalid filename');
            return;
        }
        const candidates = patternName === patternNameRaw ? [patternName] : [patternName, patternNameRaw];
        const existingCandidate = candidates.find((name) => fs.existsSync(path.join(PATTERNS_DIR, name)));
        const resolvedPatternName = existingCandidate || patternName;
        const filePath = path.join(PATTERNS_DIR, resolvedPatternName);

        // GET - Read pattern content
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
        
        // POST - Save pattern content (system patterns are editable; only delete is restricted)
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                fs.writeFileSync(filePath, body);
                res.end('Saved');
            });
            return;
        }

        // DELETE - Delete pattern
        if (req.method === 'DELETE') {
             if (fs.existsSync(filePath)) {
                 if (readPatternScope(resolvedPatternName) === 'system' && !isDeveloperModeRequest(req)) {
                     res.statusCode = 403;
                     res.end('System patterns are immutable and cannot be removed');
                     return;
                 }
                 fs.unlinkSync(filePath);
                 const metaPath = path.join(PATTERNS_DIR, resolvedPatternName.replace(/\.js$/, '.meta.json'));
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

    // API: Pattern metadata
    // GET/POST/DELETE /api/pattern-meta/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/pattern-meta/')) {
            return next();
        }

        const patternNameRaw = req.url.replace('/api/pattern-meta/', '');
        let patternName = patternNameRaw;
        try {
            patternName = decodeURIComponent(patternNameRaw);
        } catch (e) {
            res.statusCode = 400;
            res.end('Invalid filename encoding');
            return;
        }
        if (patternName.includes('..') || !patternName.endsWith('.js')) {
            res.statusCode = 400;
            res.end('Invalid filename');
            return;
        }
        const candidates = patternName === patternNameRaw ? [patternName] : [patternName, patternNameRaw];
        const existingCandidate = candidates.find((name) => fs.existsSync(path.join(PATTERNS_DIR, name)));
        const resolvedPatternName = existingCandidate || patternName;
        const metaPath = path.join(PATTERNS_DIR, resolvedPatternName.replace(/\.js$/, '.meta.json'));

        if (req.method === 'GET') {
            if (fs.existsSync(metaPath)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(fs.readFileSync(metaPath, 'utf-8'));
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.end('{}');
            }
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    if (!fs.existsSync(PATTERNS_DIR)) {
                        fs.mkdirSync(PATTERNS_DIR, { recursive: true });
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
    
    // API: Save Exported JSON
    // POST /api/save-exported/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/save-exported/')) {
            return next();
        }
        const fileName = req.url.replace('/api/save-exported/', '');
        
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
                 res.end('Exported file saved');
             });
             return;
        }
        
        next();
     });
     
    // API: Save Exported JS (ZzFXTrack Player-compatible module)
    // POST /api/save-exported-js/:filename
    server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/save-exported-js/')) {
            return next();
        }
        const fileName = req.url.replace('/api/save-exported-js/', '');
        
        if (fileName.includes('..') || !fileName.endsWith('.js')) {
             res.statusCode = 400;
             res.end('Invalid filename (must be .js)');
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
                 res.end('Exported JS file saved');
             });
             return;
        }
        
        next();
     });
     
     // API: Rename Pattern
     // POST /api/rename-pattern
	     server.middlewares.use('/api/rename-pattern', (req, res, next) => {
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
             
             const oldPath = path.join(PATTERNS_DIR, oldName);
             const newPath = path.join(PATTERNS_DIR, newName);
             
             // Check if old file exists
	             if (!fs.existsSync(oldPath)) {
               res.statusCode = 404;
               res.end('Pattern not found');
               return;
             }
             
             // Check if new name already exists
             if (fs.existsSync(newPath) && oldPath !== newPath) {
               res.statusCode = 409;
               res.end('A pattern with that name already exists');
               return;
             }
             
             // Rename the file
             fs.renameSync(oldPath, newPath);
             const oldMetaPath = patternMetaPath(oldName);
             const newMetaPath = patternMetaPath(newName);
             if (fs.existsSync(oldMetaPath)) {
               fs.renameSync(oldMetaPath, newMetaPath);
             }
             
             console.log(`[API] Renamed pattern: ${oldName} -> ${newName}`);
             res.end('Pattern renamed successfully');
             
           } catch (e) {
             console.error('[API] Rename error:', e);
             res.statusCode = 500;
             res.end(`Error renaming pattern: ${e.message}`);
           }
         });
         return;
       }
       next();
     });

     // API: Rename Arrangement
     // POST /api/rename-arrangement
     server.middlewares.use('/api/rename-arrangement', (req, res, next) => {
       if (req.method === 'POST') {
         let body = '';
         req.on('data', chunk => body += chunk);
         req.on('end', () => {
           try {
             const { oldName, newName } = JSON.parse(body);

             if (!oldName || !newName ||
                 oldName.includes('..') || newName.includes('..') ||
                 !oldName.endsWith('.js') || !newName.endsWith('.js')) {
               res.statusCode = 400;
               res.end('Invalid filename');
               return;
             }

             const oldPath = path.join(ARRANGEMENTS_DIR, oldName);
             const newPath = path.join(ARRANGEMENTS_DIR, newName);

             if (!fs.existsSync(oldPath)) {
               res.statusCode = 404;
               res.end('Arrangement not found');
               return;
             }
             const content = fs.readFileSync(oldPath, 'utf-8');
             if (readScopeFromContent(content, 'user') === 'system' && !isDeveloperModeRequest(req)) {
               res.statusCode = 403;
               res.end('System arrangements cannot be renamed. Enable developer mode to edit.');
               return;
             }

             const caseOnly = oldName.toLowerCase() === newName.toLowerCase();
             const targetPath = caseOnly
               ? path.join(ARRANGEMENTS_DIR, `__rename_${Date.now()}_${Math.random().toString(36).slice(2)}.js`)
               : newPath;

             if (!caseOnly && fs.existsSync(newPath)) {
               res.statusCode = 409;
               res.end('An arrangement with that name already exists');
               return;
             }

             fs.renameSync(oldPath, targetPath);
             if (caseOnly) fs.renameSync(targetPath, newPath);

             const nameFromFilename = newName.replace(/\.js$/i, '');
             const updatedContent = content.replace(
               /export\s+const\s+name\s*=\s*["'][^"']*["']/,
               `export const name = "${nameFromFilename}"`
             );
             fs.writeFileSync(caseOnly ? newPath : targetPath, updatedContent);

             console.log(`[API] Renamed arrangement: ${oldName} -> ${newName}`);
             res.end('Arrangement renamed successfully');
           } catch (e) {
             console.error('[API] Rename arrangement error:', e);
             res.statusCode = 500;
             res.end(`Error renaming arrangement: ${e.message}`);
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
                const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*([`"'])([\s\S]*?)\1\s*;?/);
                // Extract trackerState if present
                const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\})\s*;/);
                const scope = readScopeFromContent(content, 'user');
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
                  pattern: patternMatch ? patternMatch[2].trim() : '',
                  trackerState,
                  scope
                };
              } catch (e) {
                return { filename, name: filename.replace('.js', ''), description: '', pattern: '', trackerState: null, scope: 'user' };
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
             const { filename, name, description, pattern, trackerState, scope } = blockData;
             const normalizedScope = normalizeScope(scope, 'user');
             
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
             if (fs.existsSync(filePath)) {
               res.statusCode = 409;
               res.end('A block with that name already exists');
               return;
             }
             
             // Generate block file content
             const fileContent = `// Block: ${name}
// ${description || 'No description'}

export const name = "${name}";
export const description = "${description || ''}";
export const scope = "${normalizedScope}";

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
              const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*([`"'])([\s\S]*?)\1\s*;?/);
              const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\})\s*;/);
              const scope = readScopeFromContent(content, 'user');
              
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
                pattern: patternMatch ? patternMatch[2].trim() : '',
                trackerState,
                scope
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
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const scope = readScopeFromContent(content, 'user');
              if (scope === 'system' && !isDeveloperModeRequest(req)) {
                res.statusCode = 403;
                res.end('System blocks are immutable and cannot be removed');
                return;
              }
            } catch (_e) {
              // Continue with delete for malformed files.
            }
            const usedBy = getArrangementsUsingBlock(filename);
            if (usedBy.length) {
              res.statusCode = 409;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: 'Block is used by one or more arrangements',
                usedBy,
              }));
              return;
            }
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
              const { name, description, pattern, trackerState, scope, newFilename } = blockData;
              let existingScope = 'user';
              if (fs.existsSync(filePath)) {
                try {
                  existingScope = readScopeFromContent(fs.readFileSync(filePath, 'utf-8'), 'user');
                } catch (_e) {
                  existingScope = 'user';
                }
              }
              const normalizedScope = normalizeScope(scope, existingScope);
              
              if (!fs.existsSync(BLOCKS_DIR)) {
                fs.mkdirSync(BLOCKS_DIR, { recursive: true });
              }

              const targetFilename = (typeof newFilename === 'string' && newFilename.trim())
                ? newFilename.trim()
                : filename;
              if (targetFilename.includes('..') || !targetFilename.endsWith('.js')) {
                res.statusCode = 400;
                res.end('Invalid filename');
                return;
              }
              const targetPath = path.join(BLOCKS_DIR, targetFilename);
              if (targetFilename !== filename && fs.existsSync(targetPath)) {
                res.statusCode = 409;
                res.end('Target filename already exists');
                return;
              }
              
              // Generate block file content
              const fileContent = `// Block: ${name}
// ${description || 'No description'}

export const name = "${name}";
export const description = "${description || ''}";
export const scope = "${normalizedScope}";

export const pattern = \`${pattern}\`;

// Optional: Tracker state for re-editing
export const trackerState = ${JSON.stringify(trackerState, null, 2)};
`;

              fs.writeFileSync(targetPath, fileContent);
              if (targetFilename !== filename && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }

              // If filename changed, rewrite arrangement row references from old -> new.
              let renamedReferences = 0;
              if (targetFilename !== filename && fs.existsSync(ARRANGEMENTS_DIR)) {
                const arrangementFiles = fs.readdirSync(ARRANGEMENTS_DIR)
                  .filter(f => f.endsWith('.js') && f !== 'index.js');
                for (const arrFile of arrangementFiles) {
                  const arrPath = path.join(ARRANGEMENTS_DIR, arrFile);
                  try {
                    const content = fs.readFileSync(arrPath, 'utf-8');
                    const arrNameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
                    const arrStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
                    if (!arrStateMatch) continue;
                    const arrScope = readScopeFromContent(content, 'user');
                    if (arrScope === 'system' && !isDeveloperModeRequest(req)) continue;
                    const arrName = arrNameMatch ? arrNameMatch[1] : arrFile.replace('.js', '');
                    const arrangementState = JSON.parse(arrStateMatch[1]);
                    if (!Array.isArray(arrangementState?.rows)) continue;

                    let touched = false;
                    arrangementState.rows = arrangementState.rows.map((row) => {
                      const blocks = Array.isArray(row?.blocks) ? row.blocks : [];
                      const replaced = blocks.map((b) => {
                        if (b === filename) {
                          touched = true;
                          renamedReferences++;
                          return targetFilename;
                        }
                        return b;
                      });
                      return { ...row, blocks: replaced };
                    });

                    if (touched) {
                      const fileContent = `// Arrangement: ${arrName}

export const name = "${arrName}";
export const scope = "${arrScope}";

export const arrangementState = ${JSON.stringify(arrangementState, null, 2)};
`;
                      fs.writeFileSync(arrPath, fileContent);
                    }
                  } catch (arrErr) {
                    console.error(`[API] Failed to update arrangement references in ${arrFile}:`, arrErr);
                  }
                }
              }

              console.log(`[API] Updated block: ${filename}${targetFilename !== filename ? ` -> ${targetFilename}` : ''}`);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                ok: true,
                filename: targetFilename,
                previousFilename: filename,
                renamedReferences
              }));
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

     // API: Arrangements
     // GET /api/arrangements
     server.middlewares.use('/api/arrangements', (req, res, next) => {
       if (req.method === 'GET' && req.url === '/') {
         try {
           if (!fs.existsSync(ARRANGEMENTS_DIR)) {
             fs.mkdirSync(ARRANGEMENTS_DIR, { recursive: true });
           }

          const files = fs.readdirSync(ARRANGEMENTS_DIR)
            .filter(f => f.endsWith('.js') && f !== 'index.js');

          const arrangements = files.map(filename => {
             const filePath = path.join(ARRANGEMENTS_DIR, filename);
             try {
               const content = fs.readFileSync(filePath, 'utf-8');
               const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
               const arrangementStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
               const scope = readScopeFromContent(content, 'user');
               let arrangementState = null;
               if (arrangementStateMatch) {
                 try {
                   arrangementState = JSON.parse(arrangementStateMatch[1]);
                 } catch (e) {
                   // ignore
                 }
               }

               return {
                 filename,
                 name: nameMatch ? nameMatch[1] : filename.replace('.js', ''),
                 bpm: arrangementState?.bpm ?? 120,
                 arrangementState,
                 scope
               };
             } catch (e) {
               return { filename, name: filename.replace('.js', ''), bpm: 120, arrangementState: null, scope: 'user' };
             }
           });

           arrangements.sort((a, b) => {
             const padNum = (s) => {
               const m = (s || '').match(/^(\d+)/);
               return m ? m[1].padStart(8, '0') + s : '\x00' + s;
             };
             return padNum(a.filename || '').localeCompare(padNum(b.filename || ''));
           });

           res.setHeader('Content-Type', 'application/json');
           res.end(JSON.stringify(arrangements));
         } catch (e) {
           res.statusCode = 500;
           res.end(JSON.stringify({ error: e.message }));
         }
         return;
       }

       // POST /api/arrangements - Create new arrangement
       if (req.method === 'POST' && req.url === '/') {
         let body = '';
         req.on('data', chunk => body += chunk);
         req.on('end', () => {
           try {
             const arrangementData = JSON.parse(body);
             const { filename, arrangementState, scope } = arrangementData;
             const normalizedScope = normalizeScope(scope, 'user');

             if (!filename || filename.includes('..') || !filename.endsWith('.js')) {
               res.statusCode = 400;
               res.end('Invalid filename');
               return;
             }

             if (!fs.existsSync(ARRANGEMENTS_DIR)) {
               fs.mkdirSync(ARRANGEMENTS_DIR, { recursive: true });
             }

             const nameFromFilename = filename.replace(/\.js$/i, '');
             const filePath = path.join(ARRANGEMENTS_DIR, filename);
             if (fs.existsSync(filePath)) {
               res.statusCode = 409;
               res.end('An arrangement with that name already exists');
               return;
             }
             const fileContent = `// Arrangement: ${nameFromFilename}

export const name = "${nameFromFilename}";
export const scope = "${normalizedScope}";

export const arrangementState = ${JSON.stringify(arrangementState, null, 2)};
`;

             fs.writeFileSync(filePath, fileContent);
             console.log(`[API] Created arrangement: ${filename}`);
             res.end('Arrangement created successfully');
           } catch (e) {
             console.error('[API] Create arrangement error:', e);
             res.statusCode = 500;
             res.end(`Error creating arrangement: ${e.message}`);
           }
         });
         return;
       }

       next();
     });

      // API: Get/Delete/Update Arrangement
      // GET /api/arrangements/:filename
      // DELETE /api/arrangements/:filename
      // PUT /api/arrangements/:filename
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/arrangements/')) {
          return next();
        }

        const filename = req.url.replace('/api/arrangements/', '');
        if (!filename || filename.includes('..') || !filename.endsWith('.js')) {
          res.statusCode = 400;
          res.end('Invalid filename');
          return;
        }

        const filePath = path.join(ARRANGEMENTS_DIR, filename);

        if (req.method === 'GET') {
          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
              const arrangementStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
              const scope = readScopeFromContent(content, 'user');
              let arrangementState = null;
              if (arrangementStateMatch) {
                try {
                  arrangementState = JSON.parse(arrangementStateMatch[1]);
                } catch (e) {
                  // ignore
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                filename,
                name: nameMatch ? nameMatch[1] : filename.replace('.js', ''),
                bpm: arrangementState?.bpm ?? 120,
                arrangementState,
                scope
              }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          } else {
            res.statusCode = 404;
            res.end('Arrangement not found');
          }
          return;
        }

        if (req.method === 'DELETE') {
          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const scope = readScopeFromContent(content, 'user');
              if (scope === 'system' && !isDeveloperModeRequest(req)) {
                res.statusCode = 403;
                res.end('System arrangements are immutable and cannot be removed');
                return;
              }
            } catch (_e) {
              // Continue with delete for malformed files.
            }
            fs.unlinkSync(filePath);
            console.log(`[API] Deleted arrangement: ${filename}`);
            res.end('Deleted');
          } else {
            res.statusCode = 404;
            res.end('Arrangement not found');
          }
          return;
        }

        if (req.method === 'PUT') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const arrangementData = JSON.parse(body);
              const { arrangementState, scope } = arrangementData;
              let existingScope = 'user';
              if (fs.existsSync(filePath)) {
                try {
                  existingScope = readScopeFromContent(fs.readFileSync(filePath, 'utf-8'), 'user');
                } catch (_e) {
                  existingScope = 'user';
                }
              }
              const normalizedScope = normalizeScope(scope, existingScope);

              if (!fs.existsSync(ARRANGEMENTS_DIR)) {
                fs.mkdirSync(ARRANGEMENTS_DIR, { recursive: true });
              }

              const nameFromFilename = filename.replace(/\.js$/i, '');
              const fileContent = `// Arrangement: ${nameFromFilename}

export const name = "${nameFromFilename}";
export const scope = "${normalizedScope}";

export const arrangementState = ${JSON.stringify(arrangementState, null, 2)};
`;

              fs.writeFileSync(filePath, fileContent);
              console.log(`[API] Updated arrangement: ${filename}`);
              res.end('Updated');
            } catch (e) {
              console.error('[API] Update arrangement error:', e);
              res.statusCode = 500;
              res.end(`Error updating arrangement: ${e.message}`);
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
          instrumentMonophonic: moduleData.instrumentMonophonic || {},
          instrumentScope: moduleData.instrumentScope || {},
          instrumentType: moduleData.instrumentType || {},
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

    server.middlewares.use('/api/update-system-instruments', (req, res, next) => {
      if (req.method === 'POST') {
        const filePath = path.resolve(__dirname, 'instruments.system.js');

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            fs.writeFileSync(filePath, body);
            console.log('[API] Updated instruments.system.js');
            res.end('instruments.system.js updated');
          } catch (e) {
            res.statusCode = 500;
            res.end(`Error writing instruments.system.js: ${e.message}`);
          }
        });
        return;
      }
      next();
    });
  }
});

export default defineConfig(({ mode }) => {
  const repoName = String(process.env.GITHUB_REPOSITORY || '').split('/')[1] || '';
  const pagesBase = process.env.VITE_BASE_PATH || ((process.env.GITHUB_ACTIONS === 'true' && mode === 'demo' && repoName) ? `/${repoName}/` : '/');

  return {
    base: pagesBase,
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
        ignored: ['**/patterns/**', '**/output/**', '**/instruments.js', '**/instruments.system.js', '**/blocks/**', '**/arrangements/**']
      }
    }
  };
});
