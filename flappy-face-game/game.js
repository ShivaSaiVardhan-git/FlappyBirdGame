const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreHud = document.getElementById('score-hud');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');
const tryAgainBtn = document.getElementById('try-again-btn');
const gameOverImg = document.getElementById('game-over-img');

// Images - apply cache bust to ensure we get user replacement images
const imgPlayer = document.getElementById('img-player');
const imgPillar = document.getElementById('img-pillar');
const imgBg = document.getElementById('img-bg');
imgPlayer.src = 'assets/player.png?t=' + new Date().getTime();
imgPillar.src = 'assets/pillar.png?t=' + new Date().getTime();
imgBg.src = 'assets/background.png?t=' + new Date().getTime();

// Audio setup with AudioContext
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'flap') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'score') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

// Game State
let state = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let bestScore = localStorage.getItem('flappyFaceBestScore') || 0;
let baseSpeed = 4;
let speed = baseSpeed;
let frames = 0;
let animationId;

// Resize canvas
function resize() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}
window.addEventListener('resize', resize);
resize();

// Objects
const player = {
    x: 60,
    y: 150,
    width: 45,
    height: 45,
    velocity: 0,
    gravity: 0.3,
    jump: -7,
    rotation: 0,

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

        // Calculate rotation based on velocity (makes it look like flappy bird)
        if (state !== 'START') {
            this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
            if (state === 'GAMEOVER') {
                this.rotation = Math.PI / 2;
            }
        } else {
            this.rotation = 0;
        }

        ctx.rotate(this.rotation);

        // Draw image or fallback
        if (imgPlayer.complete && imgPlayer.naturalWidth > 0) {
            ctx.drawImage(imgPlayer, -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            // Placeholder character
            ctx.fillStyle = '#fce7f3';
            ctx.beginPath();
            ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(10, -5, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(10, 8, 8, 0, Math.PI, false);
            ctx.stroke();
        }

        ctx.restore();
    },

    update() {
        if (state === 'PLAYING') {
            this.velocity += this.gravity;
            this.y += this.velocity;

            // Floor collision
            if (this.y + this.height >= canvas.height - 20) {
                this.y = canvas.height - 20 - this.height;
                gameOver();
            }
            // Ceiling check
            if (this.y <= 0) {
                this.y = 0;
                this.velocity = 0;
            }
        } else if (state === 'GAMEOVER') {
            if (this.y + this.height < canvas.height - 20) {
                this.velocity += this.gravity;
                this.y += this.velocity;
            } else {
                this.y = canvas.height - 20 - this.height;
            }
        } else if (state === 'START') {
            // Hovering effect
            this.y = (canvas.height / 2) - (this.height / 2) + Math.sin(Date.now() / 300) * 15;
            this.x = canvas.width / 2 - this.width / 2 - 50; // slightly left of center
        }
    },

    flap() {
        this.velocity = this.jump;
        playSound('flap');
    }
};

const pillars = {
    list: [],
    width: 100,
    gap: 160,

    draw() {
        for (let i = 0; i < this.list.length; i++) {
            let p = this.list[i];

            // Draw Top Pillar
            if (imgPillar.complete && imgPillar.naturalWidth > 0) {
                // If custom image exists, stretch it vertically to look like a pipe
                ctx.save();
                ctx.translate(p.x + this.width / 2, p.topHeight / 2);
                // Tile the image vertically if we had access to multiple canvases, but here we stretch
                ctx.drawImage(imgPillar, -this.width / 2, -p.topHeight / 2, this.width, p.topHeight);
                ctx.restore();
            } else {
                ctx.fillStyle = '#22c55e';
                ctx.strokeStyle = '#166534';
                ctx.lineWidth = 3;

                ctx.fillRect(p.x, 0, this.width, p.topHeight);
                ctx.strokeRect(p.x, 0, this.width, p.topHeight);

                // Top cap
                ctx.fillRect(p.x - 5, p.topHeight - 25, this.width + 10, 25);
                ctx.strokeRect(p.x - 5, p.topHeight - 25, this.width + 10, 25);
            }

            // Draw Bottom Pillar
            let bottomHeight = canvas.height - p.bottomY;
            if (imgPillar.complete && imgPillar.naturalWidth > 0) {
                ctx.drawImage(imgPillar, p.x, p.bottomY, this.width, bottomHeight);
            } else {
                ctx.fillStyle = '#22c55e';
                ctx.strokeStyle = '#166534';
                ctx.lineWidth = 3;

                ctx.fillRect(p.x, p.bottomY, this.width, bottomHeight);
                ctx.strokeRect(p.x, p.bottomY, this.width, bottomHeight);

                // Bottom cap
                ctx.fillRect(p.x - 5, p.bottomY, this.width + 10, 25);
                ctx.strokeRect(p.x - 5, p.bottomY, this.width + 10, 25);
            }
        }
    },

    update() {
        if (state !== 'PLAYING') return;

        // Spawn pillars
        // Speed up spawn rate as speed increases
        let spawnRate = Math.max(70, 110 - Math.floor(score * 1.5));

        if (frames % spawnRate === 0) {
            let minTop = 60;
            let maxTop = canvas.height - this.gap - 60;
            let topHeight = Math.floor(Math.random() * (maxTop - minTop + 1) + minTop);

            this.list.push({
                x: canvas.width,
                topHeight: topHeight,
                bottomY: topHeight + this.gap,
                passed: false
            });
        }

        for (let i = 0; i < this.list.length; i++) {
            let p = this.list[i];
            p.x -= speed;

            // AABB Collision with nice forgiving margin
            let m = 8;
            let left = player.x + m;
            let right = player.x + player.width - m;
            let top = player.y + m;
            let bottom = player.y + player.height - m;

            let pLeft = p.x;
            let pRight = p.x + this.width;

            // Hit Top
            if (right > pLeft && left < pRight && top < p.topHeight) {
                gameOver();
            }
            // Hit Bottom
            if (right > pLeft && left < pRight && bottom > p.bottomY) {
                gameOver();
            }

            // Score handling
            if (p.x + this.width < player.x && !p.passed) {
                score++;
                p.passed = true;
                scoreHud.innerText = score;
                playSound('score');

                // Animate pop
                scoreHud.classList.remove('score-pop');
                void scoreHud.offsetWidth;
                scoreHud.classList.add('score-pop');

                // Progressive speed
                speed = baseSpeed + (score * 0.15);
            }

            // Remove passed pillars
            if (p.x + this.width < -10) {
                this.list.shift();
                i--;
            }
        }
    },

    reset() {
        this.list = [];
        speed = baseSpeed;
    }
};

// Floor/Foreground element
let fgOffset = 0;
function drawForeground() {
    ctx.fillStyle = '#84cc16';
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
    ctx.fillStyle = '#4d7c0f';

    // Moving stripes
    for (let i = 0; i < canvas.width + 40; i += 40) {
        let x = i - fgOffset;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 20);
        ctx.lineTo(x + 20, canvas.height - 20);
        ctx.lineTo(x + 10, canvas.height);
        ctx.lineTo(x - 10, canvas.height);
        ctx.fill();
    }

    if (state === 'PLAYING') {
        fgOffset = (fgOffset + speed) % 40;
    }
}

// Background element
let bgOffset = 0;

// Main Game Loop
function draw() {
    // Clear or draw background
    if (imgBg.complete && imgBg.naturalWidth > 0) {
        // Draw custom background (cover effect)
        let bgRatio = imgBg.naturalWidth / imgBg.naturalHeight;
        let canvasRatio = canvas.width / canvas.height;
        let drawWidth, drawHeight;

        // Scale to fit height properly for side-scrolling games usually
        drawHeight = canvas.height;
        drawWidth = canvas.height * bgRatio;

        // Ensure drawWidth covers the canvas at minimum
        if (drawWidth < canvas.width) {
            drawWidth = canvas.width;
            drawHeight = canvas.width / bgRatio;
        }

        // Center vertically if needed
        let dy = (canvas.height - drawHeight) / 2;

        // Calculate dynamic X offset for scrolling
        let dx = -bgOffset;

        // Draw the image twice to tile it seamlessly
        ctx.drawImage(imgBg, dx, dy, drawWidth, drawHeight);
        ctx.drawImage(imgBg, dx + drawWidth, dy, drawWidth, drawHeight);

        // Move background if playing
        if (state === 'PLAYING') {
            bgOffset = (bgOffset + (speed * 0.3)) % drawWidth;
        }
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // rely on CSS background
    }

    pillars.draw();
    drawForeground();
    player.draw();
}

function update() {
    player.update();
    pillars.update();
    if (state === 'PLAYING') frames++;
}

function loop() {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
}

// Game Flow
function startGame() {
    state = 'PLAYING';
    score = 0;
    frames = 0;
    player.x = 60;
    player.y = canvas.height / 2;
    player.velocity = 0;
    pillars.reset();

    scoreHud.innerText = score;
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');

    // First flap
    player.flap();

    // Try to ensure audio context is active
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function gameOver() {
    if (state === 'GAMEOVER') return;
    state = 'GAMEOVER';

    playSound('hit');

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('flappyFaceBestScore', bestScore);
    }

    finalScoreEl.innerText = score;
    bestScoreEl.innerText = bestScore;

    scoreHud.style.display = 'none';

    // Reset images pop-in animation
    gameOverImg.style.display = 'none';
    if (imgPillar.complete && imgPillar.naturalWidth > 0) {
        // only show if loaded
        gameOverImg.style.display = 'block';
        gameOverImg.style.animation = 'none';
        void gameOverImg.offsetWidth;
        gameOverImg.style.animation = 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    }

    // Reactivate screens
    setTimeout(() => {
        gameOverScreen.classList.add('active');

        // Reset animations on game over elements
        document.querySelector('.game-over-title').style.animation = 'none';
        document.querySelector('.score-card').style.animation = 'none';
        tryAgainBtn.style.animation = 'none';

        void gameOverScreen.offsetWidth; // reflow

        document.querySelector('.game-over-title').style.animation = 'popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 0.1s';
        document.querySelector('.score-card').style.animation = 'popIn 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 0.2s';
        tryAgainBtn.style.animation = 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 0.3s';

    }, 600); // let player fall a bit
}

// Input Handlers
function inputActions(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.type === 'keydown') e.preventDefault(); // stop space scroll

    if (state === 'START') {
        startGame();
    } else if (state === 'PLAYING') {
        player.flap();
    }
}

window.addEventListener('keydown', inputActions);
window.addEventListener('mousedown', (e) => {
    // Prevent triggering on buttons
    if (e.target.closest('#try-again-btn')) return;
    inputActions(e);
});
window.addEventListener('touchstart', (e) => {
    if (e.target.closest('#try-again-btn')) return;
    inputActions(e);
}, { passive: false });

tryAgainBtn.addEventListener('click', () => {
    state = 'START';
    gameOverScreen.classList.remove('active');
    scoreHud.style.display = 'block';
    scoreHud.innerText = '0';
    player.x = canvas.width / 2 - player.width / 2 - 50;
    player.y = canvas.height / 2;
    player.velocity = 0;
    player.rotation = 0;
    startScreen.classList.add('active');
});

// Image error handling
imgPlayer.onerror = () => console.log("No custom player face found.");
imgPillar.onerror = () => console.log("No custom pillar face found.");

// Kickoff
requestAnimationFrame(loop);
