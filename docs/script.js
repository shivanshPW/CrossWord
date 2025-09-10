document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesElement = document.getElementById('across-clues');
    const downCluesElement = document.getElementById('down-clues');
    const titleElement = document.getElementById('puzzle-title');
    const levelElement = document.getElementById('puzzle-level');
    const checkButton = document.getElementById('check-btn');
    const successOverlay = document.getElementById('success-overlay');
    const nextLevelButton = document.getElementById('next-level-btn');
    const adminPanel = document.getElementById('admin-panel');
    const forceNextButton = document.getElementById('force-next-btn');
    const clueInputContainer = document.getElementById('clue-input-container');
    const clueInputLabel = document.getElementById('clue-input-label');
    const clueInputField = document.getElementById('clue-input-field');
    const fillWordButton = document.getElementById('fill-word-btn'); // NEW: Button reference

    // State Management
    let currentPuzzleData = null;
    let nextPuzzleData = null;
    let currentLevel = 1;
    let gridState;
    let currentDirection = 'across';
    let activeClueInfo = null;
    let lastFocusedCell = { row: -1, col: -1 };

    // API Config
    const GO_BACKEND_URL = 'http://localhost:8080/generate-puzzle';

    // --- DATA VALIDATION & FETCHING ---

    function isPuzzleDataValid(puzzle) {
        if (!puzzle || !puzzle.metadata || !puzzle.clues || !puzzle.clues.across || !puzzle.clues.down) return false;
        const { metadata, clues } = puzzle;
        for (const clue of clues.across) {
            if (clue.col + clue.answer.length > metadata.size.cols) return false;
        }
        for (const clue of clues.down) {
            if (clue.row + clue.answer.length > metadata.size.rows) return false;
        }
        return true;
    }

    function sanitizePuzzleData(puzzle) {
        if (!puzzle || !puzzle.clues) return;
        ['across', 'down'].forEach(dir => {
            if (puzzle.clues[dir] && Array.isArray(puzzle.clues[dir])) {
                puzzle.clues[dir].forEach(clue => {
                    if (clue.answer && typeof clue.answer === 'string') {
                        clue.answer = clue.answer.trim();
                    }
                });
            }
        });
    }

    async function fetchNewPuzzle(difficulty) {
        try {
            const response = await fetch(GO_BACKEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ difficulty }) });
            if (!response.ok) throw new Error('HTTP error! Status: ' + response.status);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch:', error);
            return null;
        }
    }

    async function prefetchNextPuzzle() {
        if (nextPuzzleData) return;
        console.log("Prefetching next puzzle...");
        const difficultyLevels = ['easy', 'medium', 'hard', 'expert'];
        const nextDifficulty = difficultyLevels[Math.min(currentLevel, difficultyLevels.length - 1)];
        let puzzle = null;
        while (!puzzle) {
            const fetchedPuzzle = await fetchNewPuzzle(nextDifficulty);
            if (fetchedPuzzle && isPuzzleDataValid(fetchedPuzzle)) {
                puzzle = fetchedPuzzle;
            } else {
                console.warn("Prefetched puzzle was invalid. Retrying in 2 seconds...");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        sanitizePuzzleData(puzzle);
        nextPuzzleData = puzzle;
        console.log("Valid next-level puzzle has been prefetched and is ready!");
    }

    // --- GAME FLOW & INITIALIZATION ---

    async function startGame() {
        try {
            const response = await fetch('puzzle.json');
            currentPuzzleData = await response.json();
            sanitizePuzzleData(currentPuzzleData);
            initializeGame();
            prefetchNextPuzzle();
        } catch(error) {
            console.error("Failed to start game:", error);
            alert("Could not load the initial puzzle. Please check puzzle.json and refresh.");
        }
    }

    function initializeGame() {
        lastFocusedCell = { row: -1, col: -1 };
        currentDirection = 'across';
        hideClueInput();
        try {
            const { metadata, clues } = currentPuzzleData;
            const { rows, cols } = metadata.size;
            titleElement.textContent = metadata.title;
            levelElement.textContent = 'Level ' + currentLevel;
            gridState = Array(rows).fill(null).map(() => Array(cols).fill(null));
            gridElement.innerHTML = '';
            acrossCluesElement.innerHTML = '';
            downCluesElement.innerHTML = '';
            gridElement.style.gridTemplateRows = 'repeat(' + rows + ', 40px)';
            gridElement.style.gridTemplateColumns = 'repeat(' + cols + ', 40px)';
            populateGridState(clues.across);
            populateGridState(clues.down);
            renderGrid(rows, cols);
            renderClues(clues.across, acrossCluesElement, 'across');
            renderClues(clues.down, downCluesElement, 'down');
        } catch (error) {
            console.error("CRITICAL ERROR building puzzle:", error);
            alert("A critical error occurred. Trying to load the next level.");
            loadNextLevel();
        }
    }

    function loadNextLevel() {
        if (!nextPuzzleData) {
            alert("The next level is still being generated. Please wait a moment.");
            if (!prefetchNextPuzzle.isRunning) { prefetchNextPuzzle(); }
            return;
        }
        currentLevel++;
        currentPuzzleData = nextPuzzleData;
        nextPuzzleData = null;
        successOverlay.classList.add('hidden');
        initializeGame();
        prefetchNextPuzzle();
    }

    // --- GRID & CLUE RENDERING ---

    function populateGridState(clueList) {
        clueList.forEach(clue => {
            for (let i = 0; i < clue.answer.length; i++) {
                const r = clue.direction === 'across' ? clue.row : clue.row + i;
                const c = clue.direction === 'across' ? clue.col + i : clue.col;
                if (!gridState[r][c]) {
                    gridState[r][c] = { answer: '', words: [] };
                }
                gridState[r][c].answer = clue.answer[i];
                if (!gridState[r][c].words.some(w => w.number === clue.number && w.direction === clue.direction)) {
                    gridState[r][c].words.push({ number: clue.number, direction: clue.direction });
                }
                if (i === 0) gridState[r][c].clueNumber = clue.number;
            }
        });
    }

    function renderGrid(rows, cols) {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellData = gridState[r][c];
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                if (!cellData) {
                    cell.classList.add('empty');
                } else {
                    if (cellData.clueNumber) {
                        const numDiv = document.createElement('div');
                        numDiv.className = 'clue-number';
                        numDiv.textContent = cellData.clueNumber;
                        cell.appendChild(numDiv);
                    }
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.className = 'cell-input';
                    input.dataset.answer = cellData.answer.toUpperCase();
                    input.addEventListener('input', handleCellInput);
                    input.addEventListener('focus', () => handleFocus(r, c));
                    input.addEventListener('keydown', handleKeyDown);
                    cell.appendChild(input);
                }
                gridElement.appendChild(cell);
            }
        }
    }

    function renderClues(clueList, listElement, direction) {
        clueList.forEach(clue => {
            const li = document.createElement('li');
            li.textContent = clue.number + '. ' + clue.clue;
            li.dataset.number = clue.number;
            li.dataset.direction = direction;
            li.addEventListener('click', handleClueClick);
            listElement.appendChild(li);
        });
    }

    // --- USER INPUT & INTERACTION ---

    function handleCellInput(e) {
        e.target.value = e.target.value.toUpperCase();
        const { row, col } = e.target.parentElement.dataset;
        const r = parseInt(row);
        const c = parseInt(col);
        let nextCell;
        if (currentDirection === 'across' && c + 1 < currentPuzzleData.metadata.size.cols) {
            nextCell = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c + 1}"]`);
        } else if (currentDirection === 'down' && r + 1 < currentPuzzleData.metadata.size.rows) {
            nextCell = document.querySelector(`.grid-cell[data-row="${r + 1}"][data-col="${c}"]`);
        }
        if (nextCell && !nextCell.classList.contains('empty')) {
            nextCell.querySelector('input').focus();
        }
    }

    function handleKeyDown(e) {
        const cell = e.target.parentElement;
        let { row, col } = cell.dataset;
        row = parseInt(row);
        col = parseInt(col);
        let nextR = row, nextC = col;
        switch (e.key) {
            case 'ArrowUp': nextR--; break;
            case 'ArrowDown': nextR++; break;
            case 'ArrowLeft': nextC--; break;
            case 'ArrowRight': nextC++; break;
            default: return;
        }
        const nextCell = document.querySelector(`.grid-cell[data-row="${nextR}"][data-col="${nextC}"]`);
        if (nextCell && nextCell.querySelector('input')) {
            e.preventDefault();
            nextCell.querySelector('input').focus();
        }
    }
    
    function handleFocus(row, col) {
        const cellData = gridState[row][col];
        if (!cellData) {
            hideClueInput();
            return;
        }
        if (lastFocusedCell.row === row && lastFocusedCell.col === col) {
            const hasAcross = cellData.words.some(w => w.direction === 'across');
            const hasDown = cellData.words.some(w => w.direction === 'down');
            if (hasAcross && hasDown) {
                currentDirection = currentDirection === 'across' ? 'down' : 'across';
            }
        } else {
            currentDirection = cellData.words.some(w => w.direction === 'across') ? 'across' : 'down';
        }
        lastFocusedCell = { row, col };
        highlightWord(row, col, currentDirection);
        showClueInput();
    }

    function handleClueClick(e) {
        const { number, direction } = e.target.dataset;
        const clue = currentPuzzleData.clues[direction].find(c => c.number == number);
        if (clue) {
            currentDirection = direction;
            const firstCellInput = document.querySelector(`.grid-cell[data-row="${clue.row}"][data-col="${clue.col}"] input`);
            if (firstCellInput) firstCellInput.focus();
        }
    }

    function highlightWord(row, col, direction) {
        document.querySelectorAll('.focused-word, li.highlighted').forEach(el => el.classList.remove('highlighted', 'focused-word'));
        const cellData = gridState[row][col];
        if (!cellData) return;
        const wordInfo = cellData.words.find(w => w.direction === direction);
        if (!wordInfo) return;
        activeClueInfo = currentPuzzleData.clues[direction].find(c => c.number === wordInfo.number);
        if (!activeClueInfo) return;
        document.querySelector(`li[data-number="${activeClueInfo.number}"][data-direction="${direction}"]`)?.classList.add('highlighted');
        for (let i = 0; i < activeClueInfo.answer.length; i++) {
            const r = direction === 'across' ? activeClueInfo.row : activeClueInfo.row + i;
            const c = direction === 'across' ? activeClueInfo.col + i : activeClueInfo.col;
            document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`)?.classList.add('focused-word');
        }
    }

    function showClueInput() {
        if (!activeClueInfo) return;
        clueInputContainer.classList.remove('hidden');
        clueInputLabel.textContent = `${activeClueInfo.number} ${activeClueInfo.direction}: ${activeClueInfo.clue}`;
        clueInputField.value = '';
        clueInputField.setAttribute('maxlength', activeClueInfo.answer.length);
        clueInputField.focus();
    }

    function hideClueInput() {
        clueInputContainer.classList.add('hidden');
        activeClueInfo = null;
    }

    function fillWordFromInput() {
        if (!activeClueInfo) return false;
        const word = clueInputField.value.trim().toUpperCase();
        if (word.length > 0 && word.length !== activeClueInfo.answer.length) {
            alert(`Input must be ${activeClueInfo.answer.length} letters long.`);
            return false;
        }
        for (let i = 0; i < activeClueInfo.answer.length; i++) {
            const r = activeClueInfo.direction === 'across' ? activeClueInfo.row : activeClueInfo.row + i;
            const c = activeClueInfo.direction === 'across' ? activeClueInfo.col + i : activeClueInfo.col;
            const cellInput = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"] input`);
            if (cellInput) cellInput.value = word[i] || '';
        }
        return true;
    }

    function handleClueInputEnter(e) {
        if (e.key !== 'Enter' || !activeClueInfo) return;
        handleFillAction();
    }
    
    // NEW: A shared function for the Fill button and Enter key
    function handleFillAction() {
        if (!activeClueInfo) return;
        const startingCellInfo = { row: activeClueInfo.row, col: activeClueInfo.col };
        if (fillWordFromInput()) {
            hideClueInput();
            const firstCellInput = document.querySelector(`.grid-cell[data-row="${startingCellInfo.row}"][data-col="${startingCellInfo.col}"] input`);
            if (firstCellInput) firstCellInput.focus();
        }
    }

    // --- PUZZLE CHECKING ---

    function checkPuzzle() {
        if (!clueInputContainer.classList.contains('hidden') && clueInputField.value.length > 0 && activeClueInfo) {
            fillWordFromInput();
            hideClueInput();
        }

        const inputs = document.querySelectorAll('.cell-input');
        let allCorrect = true;
        inputs.forEach(input => {
            input.classList.remove('correct', 'incorrect');
            const enteredValue = input.value.toUpperCase();
            const correctValue = input.dataset.answer;
            if (enteredValue) {
                if (enteredValue === correctValue) {
                    input.classList.add('correct');
                } else {
                    allCorrect = false;
                    input.classList.add('incorrect');
                }
            } else {
                allCorrect = false;
            }
        });
        if (allCorrect) {
            successOverlay.classList.remove('hidden');
        } else {
            alert('Not quite right! The incorrect cells are marked in red.');
        }
    }

    // --- ADMIN & EVENT LISTENERS ---

    let keySequence = [];
    const secretCode = ['~', 'a', 's', 'd'];
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const key = (e.key === '`' || e.key === '~') ? '~' : e.key.toLowerCase();
        const requiredKey = secretCode[keySequence.length];
        if (key === requiredKey) {
            keySequence.push(key);
            if (keySequence.length === secretCode.length) {
                adminPanel.classList.toggle('hidden');
                keySequence = [];
            }
        } else {
            keySequence = [];
        }
    });

    checkButton.addEventListener('click', checkPuzzle);
    nextLevelButton.addEventListener('click', loadNextLevel);
    forceNextButton.addEventListener('click', loadNextLevel);
    clueInputField.addEventListener('keydown', handleClueInputEnter);
    fillWordButton.addEventListener('click', handleFillAction); // NEW: Event listener for the button

    // Start Game
    startGame();
});