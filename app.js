let startTime = 0;
let timerInterval = null;
let isRunning = false;

const runnerLapCounts = { A: 0, B: 0, C: 0 };
const runnerLastTimes = { A: 0, B: 0, C: 0 };

const mainTimerDisplay = document.getElementById('main-timer');
const startBtn = document.getElementById('start-btn');

function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const msStr = String(milliseconds).padStart(2, '0');
    
    return `${mm}:${ss}.${msStr}`;
}

function updateTimer() {
    const elapsedTime = Date.now() - startTime;
    mainTimerDisplay.textContent = formatTime(elapsedTime);
}

startBtn.addEventListener('click', () => {
    if (!isRunning) {
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 10);
        isRunning = true;
        startBtn.textContent = 'ストップ';
        startBtn.style.backgroundColor = '#ff4d4d';
        
        for (let key in runnerLapCounts) {
            runnerLapCounts[key] = 0;
            runnerLastTimes[key] = 0;
            document.getElementById(`laps-${key}`).innerHTML = '';
        }
    } else {
        clearInterval(timerInterval);
        isRunning = false;
        startBtn.textContent = '一斉スタート';
        startBtn.style.backgroundColor = '#007bff';
    }
});

document.querySelectorAll('.btn-lap').forEach(button => {
    button.addEventListener('click', (e) => {
        if (startTime === 0) return; 
        
        const runner = e.target.getAttribute('data-runner');
        const currentTotalTimeMs = Date.now() - startTime;
        const lapTimeMs = currentTotalTimeMs - runnerLastTimes[runner];
        
        runnerLastTimes[runner] = currentTotalTimeMs;
        
        const splitTimeStr = formatTime(currentTotalTimeMs);
        const lapTimeStr = formatTime(lapTimeMs);
        
        runnerLapCounts[runner]++;
        
        const lapList = document.getElementById(`laps-${runner}`);
        const newLapItem = document.createElement('li');
        
        newLapItem.textContent = `L${runnerLapCounts[runner]} | Lap: ${lapTimeStr} / Split: ${splitTimeStr}`;
        lapList.appendChild(newLapItem);
    });
});