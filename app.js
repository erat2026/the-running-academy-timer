let startTime = 0;
let timerInterval = null;
let isRunning = false;

const mainTimerDisplay = document.getElementById('main-timer');
const startBtn = document.getElementById('start-btn');

// タイマーを更新する関数
function updateTimer() {
    const elapsedTime = Date.now() - startTime;
    
    const minutes = Math.floor(elapsedTime / 60000);
    const seconds = Math.floor((elapsedTime % 60000) / 1000);
    const milliseconds = Math.floor((elapsedTime % 1000) / 10);
    
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const ms = String(milliseconds).padStart(2, '0');
    
    mainTimerDisplay.textContent = `${mm}:${ss}.${ms}`;
}

// 一斉スタートボタンの動き
startBtn.addEventListener('click', () => {
    if (!isRunning) {
        // スタート
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 10);
        isRunning = true;
        startBtn.textContent = 'ストップ';
        startBtn.style.backgroundColor = '#ff4d4d'; // 赤色に変える
    } else {
        // ストップ
        clearInterval(timerInterval);
        isRunning = false;
        startBtn.textContent = '一斉スタート';
        startBtn.style.backgroundColor = '#007bff'; // 水色に戻す
    }
});

// 各選手のゴールボタンの動き
document.querySelectorAll('.btn-lap').forEach(button => {
    button.addEventListener('click', (e) => {
        if (!isRunning && startTime === 0) return; // スタートしてなければ何もしない
        
        const runner = e.target.getAttribute('data-runner');
        const currentTime = mainTimerDisplay.textContent;
        
        // 該当する選手のレコード欄に時間を記録
        document.getElementById(`time-${runner}`).textContent = currentTime;
    });
});