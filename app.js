import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, runTransaction, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ====== ⚠️ あなたの Firebase 設定に書き換えてください ======
const firebaseConfig = {
    apiKey: "AIzaSy...", 
    authDomain: "the-running-academy-timer.firebaseapp.com",
    databaseURL: "https://the-running-academy-timer-default-rtdb.firebaseio.com",
    projectId: "the-running-academy-timer",
    storageBucket: "the-running-academy-timer.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 管理用変数
let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let currentRunners = [];

// 音声読み上げ関数
function speak(text) {
    const toggle = document.getElementById("voiceToggle");
    if (toggle && toggle.checked && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 1.2; 
        window.speechSynthesis.speak(utterance);
    }
}

// --- カウントダウン & タイマー処理 ---
window.requestStartTimer = function() {
    if (isRunning) return;
    
    document.getElementById("startBtn").classList.add("hidden");
    const countDisp = document.getElementById("countdownDisplay");
    const timeDisp = document.getElementById("stopwatchDisplay");
    
    countDisp.style.display = "block";
    timeDisp.style.display = "none";
    
    let count = 5;
    countDisp.innerText = count;
    speak(count.toString());
    
    const cdInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countDisp.innerText = count;
            speak(count.toString());
        } else {
            clearInterval(cdInterval);
            countDisp.style.display = "none";
            timeDisp.style.display = "block";
            speak("スタート");
            
            // Firebaseのタイマー状態をスタートに更新
            set(ref(db, "timer"), {
                isRunning: true,
                startTime: Date.now(),
                elapsedTime: elapsedTime
            });
        }
    }, 1000);
};

function initTimerSync() {
    onValue(ref(db, "timer"), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            isRunning = data.isRunning;
            startTime = data.startTime;
            elapsedTime = data.elapsedTime;
            
            if (isRunning) {
                document.getElementById("startBtn").classList.add("hidden");
                document.getElementById("stopBtn").classList.remove("hidden");
                if (!timerInterval) timerInterval = setInterval(updateDisplay, 10);
            } else {
                document.getElementById("startBtn").classList.remove("hidden");
                document.getElementById("stopBtn").classList.add("hidden");
                if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                updateDisplay();
            }
        }
    });
}

function updateDisplay() {
    let time = elapsedTime;
    if (isRunning) time = Date.now() - startTime + elapsedTime;
    const ms = Math.floor((time % 1000) / 10);
    const s = Math.floor((time / 1000) % 60);
    const m = Math.floor((time / 60000) % 60);
    document.getElementById("stopwatchDisplay").innerText = 
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

window.stopTimer = function() {
    if (isRunning) {
        set(ref(db, "timer"), { isRunning: false, startTime: 0, elapsedTime: Date.now() - startTime + elapsedTime });
    }
};

window.resetTimer = function() {
    if (confirm("タイマー、選手リスト、すべての記録データを完全にリセットしますか？")) {
        set(ref(db, "timer"), { isRunning: false, startTime: 0, elapsedTime: 0 });
        set(ref(db, "runners"), null);
        set(ref(db, "records"), null);
        set(ref(db, "unassigned"), null);
    }
};

// --- 選手管理（追加・削除）の同期 ---
function initRunnersSync() {
    onValue(ref(db, "runners"), (snapshot) => {
        const data = snapshot.val() || {};
        currentRunners = Object.keys(data).map(key => ({ id: key, name: data[key].name }));
        
        const manageList = document.getElementById("runnerManageList");
        manageList.innerHTML = "";
        const btnContainer = document.getElementById("runnerButtons");
        btnContainer.innerHTML = "";

        currentRunners.forEach(runner => {
            const li = document.createElement("li");
            li.className = "runner-manage-item";
            li.innerHTML = `<span>${runner.name}</span><button class="btn-delete-runner" onclick="deleteRunner('${runner.id}', '${runner.name}')">×</button>`;
            manageList.appendChild(li);

            const btn = document.createElement("button");
            btn.className = "runner-tap-btn";
            btn.innerText = runner.name;
            btn.onclick = () => recordRunnerLap(runner.name);
            btnContainer.appendChild(btn);
        });
        updateRecordsDisplay();
    });
}

window.addRunner = function() {
    const input = document.getElementById("newRunnerName");
    const name = input.value.trim();
    if (!name) return;
    const newRunnerRef = push(ref(db, "runners"));
    set(newRunnerRef, { name: name }).then(() => { input.value = ""; });
};

window.deleteRunner = function(id, name) {
    if (confirm(`${name} 選手を削除しますか？ (※ラップ記録もすべて削除されます)`)) {
        set(ref(db, `runners/${id}`), null);
        set(ref(db, `records/${name}`), null);
    }
};

// --- 🌟 選手個別ラップ・スプリットリアルタイム記録 ---
window.recordRunnerLap = function(runnerName) {
    if (!isRunning && elapsedTime === 0) {
        alert("タイマーがスタートしていません");
        return;
    }
    let currentTotalTime = elapsedTime;
    if (isRunning) currentTotalTime = Date.now() - startTime + elapsedTime;
    saveToRunnerCard(runnerName, currentTotalTime);
};

function saveToRunnerCard(runnerName, totalTime) {
    const runnerRecordRef = ref(db, `records/${runnerName}`);
    runTransaction(runnerRecordRef, (currentData) => {
        if (!currentData) { currentData = { laps: [] }; }
        if (!currentData.laps) { currentData.laps = []; }
        
        const lapCount = currentData.laps.length + 1;
        let lastTotal = 0;
        if (currentData.laps.length > 0) {
            lastTotal = currentData.laps[0].totalTime; 
        }
        const lapTime = totalTime - lastTotal;
        
        currentData.laps.unshift({
            lapNum: lapCount,
            lapTime: lapTime,
            totalTime: totalTime,
            formattedLap: formatTime(lapTime),
            formattedTotal: formatTime(totalTime)
        });
        return currentData;
    });
}

// --- 🚨 誰か不明タイム（未割当プール）の処理 ---
window.recordTimeOnly = function() {
    if (!isRunning && elapsedTime === 0) {
        alert("タイマーがスタートしていません");
        return;
    }
    let currentTotalTime = elapsedTime;
    if (isRunning) currentTotalTime = Date.now() - startTime + elapsedTime;

    const unassignedRef = push(ref(db, "unassigned"));
    set(unassignedRef, {
        totalTime: currentTotalTime,
        formattedTotal: formatTime(currentTotalTime)
    });
};

function initUnassignedSync() {
    onValue(ref(db, "unassigned"), (snapshot) => {
        const list = document.getElementById("unassignedList");
        list.innerHTML = "";
        const data = snapshot.val() || {};
        
        Object.keys(data).forEach(key => {
            const item = data[key];
            const li = document.createElement("li");
            li.className = "unassigned-item";
            
            let selectHtml = `<select id="select_${key}" style="margin:0; padding:4px; font-size:0.9em;">`;
            selectHtml += `<option value="">-- 選手を選択 --</option>`;
            currentRunners.forEach(r => {
                selectHtml += `<option value="${r.name}">${r.name}</option>`;
            });
            selectHtml += `</select>`;

            li.innerHTML = `
                <div>⏱️ <strong>${item.formattedTotal}</strong></div>
                <div class="unassigned-actions">
                    ${selectHtml}
                    <button class="btn-assign" onclick="assignTime('${key}', ${item.totalTime})">割当</button>
                    <button class="btn-clear" onclick="clearUnassigned('${key}')">消去</button>
                </div>
            `;
            list.appendChild(li);
        });
    });
}

window.assignTime = function(key, totalTime) {
    const select = document.getElementById(`select_${key}`);
    const runnerName = select.value;
    if (!runnerName) {
        alert("タイムを割り当てる選手を選択してください");
        return;
    }
    // 該当選手のカードにタイムを流し込み、未割当プールから削除
    saveToRunnerCard(runnerName, totalTime);
    remove(ref(db, `unassigned/${key}`));
};

window.clearUnassigned = function(key) {
    if (confirm("この未割当タイムを消去（デリート）しますか？")) {
        remove(ref(db, `unassigned/${key}`));
    }
};

// --- 選手別カードのリアルタイム表示同期 ---
function updateRecordsDisplay() {
    onValue(ref(db, "records"), (snapshot) => {
        const container = document.getElementById("recordsContainer");
        container.innerHTML = "";
        const data = snapshot.val() || {};
        
        currentRunners.forEach(runner => {
            const runnerData = data[runner.name] || { laps: [] };
            const card = document.createElement("div");
            card.className = "runner-card";
            
            let html = `<h3>${runner.name}</h3>`;
            html += `<ul class="lap-list">`;
            
            if (runnerData.laps && runnerData.laps.length > 0) {
                runnerData.laps.forEach(lap => {
                    html += `<li>
                        <div class="lap-row"><span class="lap-label">周回数:</span> <span class="lap-val">${lap.lapNum} 周目</span></div>
                        <div class="lap-row"><span class="lap-label">個別ラップ:</span> <span class="lap-val" style="color:#dc3545;">${lap.formattedLap}</span></div>
                        <div class="lap-row"><span class="lap-label">スプリット:</span> <span class="lap-val">${lap.formattedTotal}</span></div>
                    </li>`;
                });
            } else {
                html += `<li style="color:#aaa; border:none; text-align:center;">記録なし</li>`;
            }
            
            html += `</ul>`;
            card.innerHTML = html;
            container.appendChild(card);
        });
    });
}

function formatTime(time) {
    const ms = Math.floor((time % 1000) / 10);
    const s = Math.floor((time / 1000) % 60);
    const m = Math.floor((time / 60000) % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

// 起動初期化
initTimerSync();
initRunnersSync();
initUnassignedSync();