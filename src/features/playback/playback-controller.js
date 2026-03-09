let getEditor = () => document.getElementById('repl')?.editor || null;

export function configurePlaybackController(options = {}) {
    if (typeof options.getEditor === 'function') {
        getEditor = options.getEditor;
    }
}

export function isStrudelPlaybackActive() {
    const editor = getEditor();
    return Boolean(editor && editor.repl && editor.repl.scheduler && editor.repl.scheduler.started);
}
