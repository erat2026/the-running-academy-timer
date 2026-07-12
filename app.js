let startTime = 0;
let timerInterval = null;
let isRunning = false;

// 選手ごとのラップ数を数えるためのカウンター
const runnerLapCounts = { A: 0, B: 0, C: 0 };
// 選手ごとの「前回の記録時間」を覚えておくための保管庫（ミリ秒）
const runnerLastTimes = { A: 0, B: 0, C: 0 };

const mainTimerDisplay = document.getElementById('main-timer');
const startBtn = document.getElementById('start-btn');

// ミリ秒を「00:00.00」の形式に変換する便利な関数
function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const msStr = String(milliseconds).padStart(2, '0');
    
    return `${mm}:${ss}.${msStr}`;
}

// タイマーを更新する関数
function updateTimer() {
    const elapsedTime = Date.now() - startTime;
    mainTimerDisplay.textContent = formatTime(elapsedTime);
}

// 一斉スタートボタンの動き
startBtn.addEventListener('click', () => {
    if (!isRunning) {
        // スタート
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 10);
        isRunning = true;
        startBtn.textContent = 'ストップ';
        startBtn.style.backgroundColor = '#ff4d4d';
        
        // 【新機能】新しくスタートする時に、前回の記録をきれいにリセットする
        for (let key in runnerLapCounts) {
            runnerLapCounts[key] = 0;
            runnerLastTimes[key] = 0;
            document.getElementById(`laps-${key}`).innerHTML = ''; // 画面のリストを空っぽにする
        }
    } else {
        // ストップ
        clearInterval(timerInterval);
        isRunning = false;
        startBtn.textContent = '一斉スタート';
        startBtn.style.backgroundColor = '#007bff';
    }
});

// 各選手のラップ・スプリットボタンの動き
document.querySelectorAll('.btn-lap').forEach(button => {
    button.addEventListener('click', (e) => {
        if (startTime === 0) return; // スタートしてなければ何もしない
        
        const runner = e.target.getAttribute('data-runner');
        
        // ①現在の総経過時間（これがスプリットタイムになります）
        const currentTotalTimeMs = Date.now() - startTime;
        
        // ②今回の区間時間（これがラップタイムになります ＝ 今回の時間 ー 前回の時間）
        const lapTimeMs = currentTotalTimeMs - runnerLastTimes[runner];
        
        // 次回の計算のために、今回の時間を「前回の時間」として上書き保存しておく
        runnerLastTimes[runner] = currentTotalTimeMs;
        
        // 数字を「00:00.00」の文字に変える
        const splitTimeStr = formatTime(currentTotalTimeMs);
        const lapTimeStr = formatTime(lapTimeMs);
        
        // ラップ数を1増やす
        runnerLapCounts[runner]++;
        
        // 画面に表示する
        const lapList = document.getElementById(`laps-${runner}`);
        const newLapItem = document.createElement('li');
        
        // 【ここがポイント！】ラップとスプリットを分かりやすく横並びにします
        newLapItem.textContent = `L${runnerLapCounts[runner]} | Lap: ${lapTimeStr} / Split: ${splitTimeStr}`;
        
        lapList.appendChild(newLapItem);
    });
});
