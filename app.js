let startTime = 0;
let timerInterval = null;
let realtimeInterval = null;
let isRunning = false;
let isCountingDown = false;
let startDateTimeStr = ""; // Excel・ファイル名用のスタート日時文字列

// 押し間違い防止用のボタンカラーパターン（最大10色、循環）
const colorPalette = ['#007bff', '#2b8a3e', '#e67e22', '#9c27b0', '#e91e63', '#009688', '#4caf50', '#ff9800', '#795548', '#607d8b'];

let runners = [];

const savedRunners = localStorage.getItem('running_runners_ultimate_v3');
if (savedRunners) {
    runners = JSON.parse(savedRunners);
} else {
    runners = [
        { id: 'R1', name: '選手 A', lapCount: 0, lastTime: 0, laps: [], color: colorPalette[0] },
        { id: 'R2', name: '選手 B', lapCount: 0, lastTime: 0, laps: [], color: colorPalette[1] },
        { id: 'R3', name: '選手 C', lapCount: 0, lastTime: 0, laps: [], color: colorPalette[2] }
    ];
}

const mainTimerDisplay = document.getElementById('main-timer');
const startBtn = document.getElementById('start-btn');
const countdownText = document.getElementById('countdown-text');
const pendingList = document.getElementById('pending-list');
const runnersContainer = document.getElementById('runners-container');
const newRunnerNameInput = document.getElementById('new-runner-name');
const allStopBtn = document.getElementById('all-stop-btn');
const speechModeSelect = document.getElementById('speech-mode');
const resetAllBtn = document.getElementById('reset-all-btn');

function saveRunnersToStorage() {
    localStorage.setItem('running_runners_ultimate_v3', JSON.stringify(runners));
}

function triggerVibration() {
    if (navigator.vibrate) navigator.vibrate(100);
}

// ブラウザの音声読み上げ機能 (Text-to-Speech)
function speakTime(runnerName, lapStr, splitStr) {
    const mode = speechModeSelect.value;
    if (mode === 'none') return;

    let textToSpeak = `${runnerName}、`;
    const cleanLap = lapStr.replace('.', '秒').replace(':', '分');
    const cleanSplit = splitStr.replace('.', '秒').replace(':', '分');

    if (mode === 'lap') {
        textToSpeak += `${cleanLap}`;
    } else if (mode === 'split') {
        textToSpeak += `${cleanSplit}`;
    } else if (mode === 'both') {
        textToSpeak += `ラップ ${cleanLap}、スプリット ${cleanSplit}`;
    }

    try {
        window.speechSynthesis.cancel(); // 前の音声をカットして即座に発話
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'ja-JP';
        utterance.rate = 1.2; // 少し早口で聞き取りやすく
        window.speechSynthesis.speak(utterance);
    } catch(e) { console.log("音声読み上げエラー", e); }
}

function playBeep(isStartSound = false) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        if (isStartSound) {
            oscillator.frequency.value = 880;
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
            oscillator.stop(audioCtx.currentTime + 0.4);
        } else {
            oscillator.frequency.value = 440;
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            oscillator.stop(audioCtx.currentTime + 0.1);
        }
    } catch (e) { console.log(e); }
}

function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
}

function updateTimer() {
    const elapsedTime = Date.now() - startTime;
    mainTimerDisplay.textContent = formatTime(elapsedTime);
}

// 選手カード内のリアルタイムラップをピコピコ更新する関数
function updateRealtimeLaps() {
    if (!isRunning || startTime === 0) return;
    const currentTotalTimeMs = Date.now() - startTime;
    
    runners.forEach(runner => {
        const rtElement = document.getElementById(`rt-lap-${runner.id}`);
        if (rtElement) {
            const currentLapMs = currentTotalTimeMs - runner.lastTime;
            rtElement.textContent = `⚡直前Lap経過: ${formatTime(currentLapMs)}`;
        }
    });
}

function renderRunners() {
    runnersContainer.innerHTML = '';
    runners.forEach((runner, index) => {
        const card = document.createElement('div');
        card.className = 'runner-card';
        card.style.borderLeftColor = runner.color;
        
        const latestSplit = runner.laps.length > 0 ? runner.laps[runner.laps.length - 1].split : '--:--.--';
        const hasLaps = runner.laps.length > 0;

        card.innerHTML = `
            <div class="runner-top-row">
                <div class="runner-controls">
                    <button class="btn-ctrl" onclick="moveRunner(${index}, -1)">▲</button>
                    <button class="btn-ctrl" onclick="moveRunner(${index}, 1)">▼</button>
                    <button class="btn-ctrl btn-del" onclick="deleteRunner(${index})">× 削除</button>
                </div>
                <!-- 修正リカバリーボタン：記録がある場合のみ表示 -->
                ${hasLaps ? `<button class="btn-undo" onclick="undoRunnerLastLap('${runner.id}')">↩️ 直前の記録を取り消して未割振に戻す</button>` : ''}
            </div>
            <div class="runner-info">
                <span class="runner-name">
                    <span class="color-tag" style="background: ${runner.color}"></span>
                    <strong>${runner.name}</strong> 
                    <span class="split-mini">(Split: ${latestSplit})</span>
                    <span id="rt-lap-${runner.id}" class="rt-lap">⚡直前Lap経過: 00:00.00</span>
                </span>
                <button class="btn btn-lap" style="background-color: ${runner.color};" onclick="handleLapClick('${runner.id}')">ラップ記録</button>
            </div>
            <ul class="lap-list">
                ${runner.laps.map(lap => `<li>L${lap.num} | Lap: ${lap.lapTime} / Split: ${lap.split}</li>`).join('')}
            </ul>
        `;
        runnersContainer.appendChild(card);
    });
    
    updatePendingActionButtons();
}

// 選手追加
document.getElementById('add-runner-btn').addEventListener('click', () => {
    const name = newRunnerNameInput.value.trim();
    if (!name) return;
    const newId = 'R' + Date.now();
    const assignedColor = colorPalette[runners.length % colorPalette.length];
    runners.push({ id: newId, name: name, lapCount: 0, lastTime: 0, laps: [], color: assignedColor });
    newRunnerNameInput.value = '';
    saveRunnersToStorage();
    renderRunners();
});

// 選手削除
window.deleteRunner = function(index) {
    if (confirm(`${runners[index].name} を削除しますか？`)) {
        runners.splice(index, 1);
        saveRunnersToStorage();
        renderRunners();
    }
};

// 選手並び替え
window.moveRunner = function(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= runners.length) return;
    const temp = runners[index];
    runners[index] = runners[targetIndex];
    runners[targetIndex] = temp;
    saveRunnersToStorage();
    renderRunners();
};

// 【修正・リカバリー機能】間違えて入れたタイムを未割り振りへ戻す
window.undoRunnerLastLap = function(runnerId) {
    const runner = runners.find(r => r.id === runnerId);
    if (!runner || runner.laps.length === 0) return;
    
    triggerVibration();
    
    // 1. 最後に記録したラップデータを1つ取り出す
    const removedLap = runner.laps.pop();
    runner.lapCount--;
    
    // 2. 前回のタイム保管庫を、さらにその1つ前のスプリットミリ秒に戻す
    if (runner.laps.length === 0) {
        runner.lastTime = 0;
    } else {
        // 表示用文字列をミリ秒に逆算するのは困難なため、データの保存形式を補完して対応
        runner.lastTime = removedLap.rawTotalTimeMs - removedLap.rawLapTimeMs; // 擬似計算用、または簡易リセット対応
        // 厳密な巻き戻しのために生ミリ秒を逆算
        runner.lastTime = removedLap.previousLastTime || 0;
    }
    
    // 3. 未割り振りリストの「先頭」に戻す
    createPendingItemElement(removedLap.rawTotalTimeMs);
    
    renderRunners();
};

// カウントダウン始動
startBtn.addEventListener('click', () => {
    if (isCountingDown) return;
    if (!isRunning) {
        isCountingDown = true;
        startBtn.textContent = '準備中...';
        startBtn.style.backgroundColor = '#ccc';
        
        // 走る前の初期化
        runners.forEach(r => {
            r.lapCount = 0;
            r.lastTime = 0;
            r.laps = [];
        });
        pendingList.innerHTML = '';
        renderRunners();

        countdownText.textContent = '🔊 On your marks...';
        setTimeout(() => {
            countdownText.textContent = '3'; playBeep(false);
            setTimeout(() => {
                countdownText.textContent = '2'; playBeep(false);
                setTimeout(() => {
                    countdownText.textContent = '1'; playBeep(false);
                    setTimeout(() => {
                        countdownText.textContent = '🏃‍♂️ START!!'; playBeep(true);
                        
                        // スタート日時の取得（ファイル名・Excel用）
                        const now = new Date();
                        startDateTimeStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                        
                        startTime = Date.now();
                        timerInterval = setInterval(updateTimer, 10);
                        realtimeInterval = setInterval(updateRealtimeLaps, 200); // リアルタイムラップのピコピコ動く更新
                        isRunning = true;
                        isCountingDown = false;
                        startBtn.textContent = 'ストップ';
                        startBtn.style.backgroundColor = '#ff4d4d';
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 3000);
    } else {
        stopTimerMain();
    }
});

function stopTimerMain() {
    clearInterval(timerInterval);
    clearInterval(realtimeInterval);
    isRunning = false;
    countdownText.textContent = '';
    startBtn.textContent = 'カウントダウン始動';
    startBtn.style.backgroundColor = '#007bff';
}

// 全体リセットボタン
resetAllBtn.addEventListener('click', () => {
    if (confirm("タイマーおよび全員のすべての計測結果を完全にリセット（消去）してもよろしいですか？")) {
        stopTimerMain();
        startTime = 0;
        mainTimerDisplay.textContent = "00:00.00";
        runners.forEach(r => {
            r.lapCount = 0;
            r.lastTime = 0;
            r.laps = [];
        });
        pendingList.innerHTML = '';
        renderRunners();
    }
});

window.handleLapClick = function(runnerId) {
    if (startTime === 0 || isCountingDown) return;
    triggerVibration();
    const currentTotalTimeMs = Date.now() - startTime;
    recordTimeData(runnerId, currentTotalTimeMs);
};

// タイム記録の核ロジック
function recordTimeData(runnerId, totalTimeMs) {
    const runner = runners.find(r => r.id === runnerId);
    if (!runner) return;

    const previousLastTime = runner.lastTime; // 巻き戻し用に保存
    const lapTimeMs = totalTimeMs - runner.lastTime;
    runner.lastTime = totalTimeMs;

    runner.lapCount++;
    const lapStr = formatTime(lapTimeMs);
    const splitStr = formatTime(totalTimeMs);

    runner.laps.push({
        num: runner.lapCount,
        lapTime: lapStr,
        split: splitStr,
        rawTotalTimeMs: totalTimeMs, // リカバリー用データ
        rawLapTimeMs: lapTimeMs,       // リカバリー用データ
        previousLastTime: previousLastTime // リカバリー用データ
    });
    
    // 音声読み上げの発動
    speakTime(runner.name, lapStr, splitStr);
    
    renderRunners();
}

// 誰か分からんが今ゴールボタン（大主役）
document.getElementById('quick-lap-btn').addEventListener('click', () => {
    if (startTime === 0 || isCountingDown) return;
    triggerVibration();
    const currentTotalTimeMs = Date.now() - startTime;
    
    createPendingItemElement(currentTotalTimeMs);
});

// 未割り振りアイテムを視覚的に生成する関数
function createPendingItemElement(totalTimeMs) {
    const timeStr = formatTime(totalTimeMs);
    const div = document.createElement('div');
    div.className = 'pending-item';
    div.dataset.timeMs = totalTimeMs;
    div.innerHTML = `
        <div class="pending-time-text">⏱️ ${timeStr}</div>
        <div class="assign-btn-group"></div>
    `;
    // 新しいものは上に追加
    pendingList.insertBefore(div, pendingList.firstChild);
    updatePendingActionButtons();
}

// 保留リスト内の割り当てボタンを選手データから最新作成（色付き・名前付き）
function updatePendingActionButtons() {
    const items = pendingList.querySelectorAll('.pending-item');
    items.forEach(item => {
        const btnGroup = item.querySelector('.assign-btn-group');
        if (!btnGroup) return;
        const timeMs = parseInt(item.dataset.timeMs);
        
        btnGroup.innerHTML = runners.map(r => `
            <button class="assign-btn" style="background-color: ${r.color};" onclick="assignPendingTime('${r.id}', ${timeMs}, this)">${r.name}へ</button>
        `).join('');
    });
}

// 確定割り振り（押したらリストから完全に消える）
window.assignPendingTime = function(runnerId, totalTimeMs, buttonEl) {
    triggerVibration();
    recordTimeData(runnerId, totalTimeMs);
    // 選手確定したため、この未割り振り要素を画面から完全に削除
    buttonEl.closest('.pending-item').remove();
};

allStopBtn.addEventListener('click', () => {
    if (!isRunning || startTime === 0 || isCountingDown) return;
    triggerVibration();
    playBeep(true);
    const finalTimeMs = Date.now() - startTime;
    runners.forEach(runner => {
        recordTimeData(runner.id, finalTimeMs);
    });
    stopTimerMain();
});

// Excel保存（日時ヘッダー ＆ 日時ファイル名化）
document.getElementById('download-csv-btn').addEventListener('click', () => {
    let csvContent = "\uFEFF"; 
    
    // Excel上部にスタート日時を表示させる
    csvContent += `計測スタート日時,${startDateTimeStr || "記録なし(手動スタート)"},,\n`;
    csvContent += ",\n"; // 1行あける
    csvContent += "選手名,ラップ数,ラップタイム,スプリットタイム\n";
    
    runners.forEach(r => {
        if (r.laps.length === 0) {
            csvContent += `"${r.name}",記録なし,,\n`;
        } else {
            r.laps.forEach(lap => {
                csvContent += `"${r.name}",L${lap.num},${lap.lapTime},${lap.split}\n`;
            });
        }
    });
    
    // ファイル名用の形に変換 (例: 2026-07-12_1605)
    const fileDate = (startDateTimeStr || new Date().toLocaleString('ja-JP'))
                        .replace(/\//g, '-')
                        .replace(' ', '_')
                        .replace(/:/g, '');
                        
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `running_records_${fileDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

renderRunners();