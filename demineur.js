/* =========================================================
    Demineur.py — easter egg
    - Charge Pyodide (CPython en WebAssembly) uniquement quand on en a besoin
    - Execute minesweeper.py : toute la logique du jeu est en Python
    - Ce fichier ne fait que l'affichage et les clics
    Pour le lancer : "python minesweeper.py" dans l'invite de commandes,
    le code Konami, ou Demarrer > Tous les programmes > Jeux.
    ========================================================= */
(() => {
    const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
    const LEVELS = [
        { name: 'Débutant', rows: 9, cols: 9, mines: 10 },
        { name: 'Intermédiaire', rows: 16, cols: 16, mines: 40 },
        { name: 'Expert', rows: 16, cols: 30, mines: 99 }
    ];

    /* ---------- Chargement de Python (partage avec le terminal) ---------- */
    let pythonPromise = null;
    window.loadPython = () => {
        pythonPromise ||= new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${PYODIDE_URL}pyodide.js`;
            script.onload = async () => {
                try {
                    const py = await window.loadPyodide({ indexURL: PYODIDE_URL });
                    window.pyodideInstance = py;
                    resolve(py);
                } catch (error) { reject(error); }
            };
            script.onerror = () => reject(new Error('Pyodide indisponible'));
            document.head.append(script);
        }).catch((error) => { pythonPromise = null; throw error; });
        return pythonPromise;
    };

    /* ---------- Elements ---------- */
    const $ = (selector) => document.querySelector(selector);
    const win = $('#demineur');
    const loading = $('#mines-loading');
    const loadingText = $('#mines-loading-text');
    const gameBox = $('#mines-game');
    const grid = $('#mines-grid');
    const face = $('#mines-face');
    const leftOut = $('#mines-left');
    const timeOut = $('#mines-time');
    const status = $('#mines-status');
    const flagButton = $('#flag-mode');

    let py = null;
    let Demineur = null;
    let game = null;
    let level = 0;
    let cells = [];
    let state = null;
    let seconds = 0;
    let timer = 0;
    let flagMode = false;
    let longPress = 0;
    let skipClick = false;

    const store = {
        get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }
    };

    const FLAG = '<svg viewBox="0 0 16 16"><path d="M6 2v10" stroke="#000" stroke-width="1.6"/><path d="M6 2 13 5 6 8z" fill="#e00"/><path d="M3 13.5h8" stroke="#000" stroke-width="2.2"/></svg>';
    const MINE = '<svg><use href="#i-mine"/></svg>';
    const WRONG = '<svg viewBox="0 0 48 48"><use href="#i-mine"/><path d="M8 8l32 32M40 8 8 40" stroke="#e00" stroke-width="5"/></svg>';

    function faceSvg(mood) {
        const eyes = mood === 'dead'
            ? '<path d="M8 9l3 3M11 9l-3 3M17 9l3 3M20 9l-3 3" stroke="#000" stroke-width="1.6"/>'
            : mood === 'cool'
                ? '<path d="M6 10h16" stroke="#000" stroke-width="1.4"/><rect x="7" y="9" width="6" height="4" rx="1.5"/><rect x="15" y="9" width="6" height="4" rx="1.5"/>'
                : '<circle cx="10" cy="11" r="1.6"/><circle cx="18" cy="11" r="1.6"/>';
        const mouth = mood === 'oh'
            ? '<circle cx="14" cy="19" r="2.6" fill="none" stroke="#000" stroke-width="1.6"/>'
            : mood === 'dead'
                ? '<path d="M9 21q5-5 10 0" fill="none" stroke="#000" stroke-width="1.6"/>'
                : '<path d="M9 17q5 5 10 0" fill="none" stroke="#000" stroke-width="1.6"/>';
        return `<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="#ffe600" stroke="#000" stroke-width="1.2"/>${eyes}${mouth}</svg>`;
    }

    const pad = (value) => String(Math.max(-99, Math.min(999, value))).padStart(3, '0');

    /* ---------- Demarrage ---------- */
    async function boot() {
        if (Demineur) return;
        loading.hidden = false;
        gameBox.hidden = true;
        try {
            loadingText.textContent = 'Téléchargement de l\'interpréteur (Pyodide)…';
            py = await window.loadPython();
            loadingText.textContent = 'Exécution de minesweeper.py…';
            const response = await fetch('minesweeper.py');
            if (!response.ok) throw new Error('minesweeper.py introuvable');
            // Ecrit le fichier dans le systeme de fichiers virtuel puis l'importe comme un vrai module.
            py.FS.writeFile('/home/pyodide/minesweeper.py', await response.text());
            py.runPython('import sys\nif "/home/pyodide" not in sys.path: sys.path.insert(0, "/home/pyodide")');
            Demineur = py.pyimport('minesweeper').Demineur;
            loading.hidden = true;
            gameBox.hidden = false;
            newGame();
        } catch (error) {
            loadingText.textContent = location.protocol === 'file:'
                ? 'Ouvre le site via un serveur local (ex : Live Server) pour lancer le jeu.'
                : 'Python n\'a pas pu démarrer. Vérifie ta connexion puis rouvre la fenêtre.';
            $('#mines-loading .xp-progress').hidden = true;
        }
    }

    function newGame(newLevel = level) {
        if (!Demineur) return;
        level = newLevel;
        const { rows, cols, mines } = LEVELS[level];
        game?.destroy?.();
        game = Demineur(rows, cols, mines);
        clearInterval(timer);
        seconds = 0;
        timeOut.textContent = '000';
        face.innerHTML = faceSvg('smile');
        document.querySelectorAll('.mines-menu [data-level]').forEach((button) => {
            button.classList.toggle('active', Number(button.dataset.level) === level);
        });

        grid.style.gridTemplateColumns = `repeat(${cols}, 24px)`;
        grid.innerHTML = '';
        cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'cell';
                cell.dataset.r = r;
                cell.dataset.c = c;
                cell.setAttribute('aria-label', `Case ${r + 1}, ${c + 1}`);
                grid.append(cell);
                cells.push(cell);
            }
        }
        const best = store.get(`kxp-mines-best-${level}`);
        status.textContent = best ? `${LEVELS[level].name} · record : ${best} s` : `${LEVELS[level].name} · logique : minesweeper.py`;
        apply(game.etat());
    }

    /* ---------- Affichage de l'etat renvoye par Python ---------- */
    function apply(json) {
        const previous = state?.statut;
        state = JSON.parse(json);
        leftOut.textContent = pad(state.restantes);
        state.plateau.forEach((row, r) => row.forEach((value, c) => {
            const cell = cells[r * row.length + c];
            const open = /^[0-8]$/.test(value);
            cell.className = `cell${open ? ` open n${value}` : ''}${value === 'x' ? ' open boom' : ''}${value === 'm' || value === 'w' ? ' open' : ''}`;
            cell.innerHTML = open ? (value === '0' ? '' : value)
                : value === 'f' ? FLAG
                    : value === 'm' || value === 'x' ? MINE
                        : value === 'w' ? WRONG : '';
        }));

        if (previous === 'pret' && state.statut === 'en_cours') {
            timer = setInterval(() => { seconds += 1; timeOut.textContent = pad(seconds); }, 1000);
        }
        if (state.statut === 'perdu' && previous !== 'perdu') {
            clearInterval(timer);
            face.innerHTML = faceSvg('dead');
            status.textContent = 'BOUM. Clique sur le smiley pour rejouer.';
            window.kxp?.sound.boom();
        }
        if (state.statut === 'gagne' && previous !== 'gagne') {
            clearInterval(timer);
            face.innerHTML = faceSvg('cool');
            const key = `kxp-mines-best-${level}`;
            const best = store.get(key);
            const record = !best || seconds < best;
            if (record) store.set(key, seconds);
            status.textContent = `Gagné en ${seconds} s${record ? ' · nouveau record !' : ''}`;
            window.kxp?.sound.win();
            window.kxp?.showBalloon('Bravo, démineur confirmé !', `Partie gagnée en ${seconds} s (${LEVELS[level].name}). Tu as trouvé l'easter egg : le jeu tourne en Python dans ton navigateur.`);
        }
    }

    function act(cell, action) {
        if (!game || !cell) return;
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        apply(game[action](r, c));
    }

    /* ---------- Interactions ---------- */
    grid.addEventListener('click', (event) => {
        const cell = event.target.closest('.cell');
        if (!cell || skipClick) { skipClick = false; return; }
        if (cell.classList.contains('open')) return act(cell, 'accord');
        act(cell, flagMode ? 'drapeau' : 'ouvrir');
    });
    grid.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        act(event.target.closest('.cell'), 'drapeau');
    });

    // Appui long sur ecran tactile = drapeau
    grid.addEventListener('pointerdown', (event) => {
        if (state && (state.statut === 'en_cours' || state.statut === 'pret') && event.button === 0) face.innerHTML = faceSvg('oh');
        if (event.pointerType !== 'touch') return;
        const cell = event.target.closest('.cell');
        longPress = setTimeout(() => {
            act(cell, 'drapeau');
            skipClick = true;
            navigator.vibrate?.(30);
        }, 420);
    });
    const release = () => {
        clearTimeout(longPress);
        if (state && (state.statut === 'en_cours' || state.statut === 'pret')) face.innerHTML = faceSvg('smile');
    };
    grid.addEventListener('pointerup', release);
    grid.addEventListener('pointerleave', release);
    grid.addEventListener('pointercancel', release);

    face.addEventListener('click', () => newGame());
    document.querySelectorAll('.mines-menu [data-level]').forEach((button) => {
        button.addEventListener('click', () => newGame(Number(button.dataset.level)));
    });
    flagButton.addEventListener('click', () => {
        flagMode = !flagMode;
        flagButton.setAttribute('aria-pressed', String(flagMode));
    });

    win.addEventListener('win:open', () => {
        if (!Demineur) return boot();
        if (state?.statut === 'en_cours') {
            clearInterval(timer);
            timer = setInterval(() => { seconds += 1; timeOut.textContent = pad(seconds); }, 1000);
        }
    });
    win.addEventListener('win:close', () => clearInterval(timer));
})();
