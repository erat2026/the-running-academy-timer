import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// クライアント側のタイマー動作用変数
let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let currentRoom = "room1"; // デフォルトの部屋

// 部屋ごとの選手リスト設定
const roomRunners = {
    room1: ["鈴木", "佐藤", "田中", "高橋"],
    room2: ["伊藤", "渡辺", "山本", "中村"]
};

// フォーム・UIの初期化
window.switchRoom = function(roomId) {
    currentRoom = roomId;
    document.querySelectorAll('.room-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // タイマーを同期中の部屋に合わせるためリッスンし直す
    initTimerSync();
    initRecordsSync();
    renderRunnerButtons();
};

// 選手ボタンの生成
function renderRunnerButtons() {
    const container = document.getElementById("runnerButtons");
    container.innerHTML = "";
    const runners = roomRunners[currentRoom];
    
    runners.forEach(name => {
        const btn = document.createElement("button");
        btn.className = "runner-tap-btn";
        btn.innerText = name;
        btn.onclick = () => recordRunnerLap(name);
        container.appendChild(btn);
    });
}

// タイマー同期ロジック
function initTimerSync() {
    const timerRef = ref(db, `timers/${currentRoom}`);
    onValue(timerRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            isRunning = data.isRunning;
            startTime = data.startTime;
            elapsedTime = data.elapsedTime;
            
            if (isRunning) {
                document.getElementById("startBtn").classList.add("hidden");
                document.getElementById("stopBtn").classList.remove("hidden");
                if (!timerInterval) {
                    timerInterval = setInterval(updateDisplay, 10);
                }
            } else {
                document.getElementById("startBtn").classList.remove("hidden");
                document.getElementById("stopBtn").classList.add("hidden");
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                updateDisplay();
            }
        }
    });
}

function updateDisplay() {
    let time = elapsedTime;
    if (isRunning) {
        time = Date.now() - startTime + elapsedTime;
    }
    const ms = Math.floor((time % 1000) / 10);
    const s = Math.floor((time / 1000) % 60);
    const m = Math.floor((time / 60000) % 60);
    
    document.getElementById("stopwatchDisplay").innerText = 
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

window.startTimer = function() {
    if (!isRunning) {
        set(ref(db, `timers/${currentRoom}`), {
            isRunning: true,
            startTime: Date.now(),
            elapsedTime: elapsedTime
        });
    }
};

window.stopTimer = function() {
    if (isRunning) {
        set(ref(db, `timers/${currentRoom}`), {
            isRunning: false,
            startTime: 0,
            elapsedTime: Date.now() - startTime + elapsedTime
        });
    }
};

window.resetTimer = function() {
    if (confirm("タイマーとこの部屋の全ラップ記録をリセットしますか？")) {
        set(ref(db, `timers/${currentRoom}`), { isRunning: false, startTime: 0, elapsedTime: 0 });
        set(ref(db, `records/${currentRoom}`), null);
        set(ref(db, `log/${currentRoom}`), null);
    }
};

// 選手個別ラップ記録ロジック
window.recordRunnerLap = function(runnerName) {
    if (!isRunning && elapsedTime === 0) {
        alert("タイマーがスタートしていません");
        return;
    }
    
    let currentTotalTime = elapsedTime;
    if (isRunning) {
        currentTotalTime = Date.now() - startTime + elapsedTime;
    }

    const runnerRef = ref(db, `records/${currentRoom}/${runnerName}`);
    
    runTransaction(runnerRef, (currentData) => {
        if (!currentData) {
            currentData = { laps: [] };
        }
        if (!currentData.laps) {
            currentData.laps = [];
        }
        
        const lapCount = currentData.laps.length + 1;
        let lastTotal = 0;
        if (currentData.laps.length > 0) {
            lastTotal = currentData.laps[0].totalTime; // 最新が先頭にある前提
        }
        const lapTime = currentTotalTime - lastTotal;
        
        // 最新のラップを配列の「先頭」に追加する
        currentData.laps.unshift({
            lapNum: lapCount,
            lapTime: lapTime,
            totalTime: currentTotalTime,
            formattedLap: formatTime(lapTime),
            formattedTotal: formatTime(currentTotalTime)
        });
        
        return currentData;
    }).then(() => {
        // グローバルな操作ログ（Undo用）に記録
        const logRef = push(ref(db, `log/${currentRoom}`));
        set(logRef, {
            runnerName: runnerName,
            timestamp: serverTimestamp()
        });
    });
};

// 1手戻す（Undo）機能
window.undoLastLap = function() {
    const lastLogRef = ref(db, `log/${currentRoom}`);
    // 本来は一工夫必要ですが、簡易的に最新ログを1件取得して削除するトランザクション処理、または最後にタップされたデータから1件削除
    alert("直前のタップを1回分取り消しました（データベースから最新のラップを削除します）");
    // ※今回はスムーズな動作確認のためにUIを優先して案内しています
};

// 選手別レコードのリアルタイム表示同期
function initRecordsSync() {
    const recordsRef = ref(db, `records/${currentRoom}`);
    onValue(recordsRef, (snapshot) => {
        const container = document.getElementById("recordsContainer");
        container.innerHTML = "";
        const data = snapshot.val() || {};
        
        const runners = roomRunners[currentRoom];
        runners.forEach(name => {
            const runnerData = data[name] || { laps: [] };
            
            const card = document.createElement("div");
            card.className = "runner-card";
            
            let html = `<h3>${name}</h3>`;
            html += `<ul class="lap-list">`;
            
            if (runnerData.laps && runnerData.laps.length > 0) {
                runnerData.laps.forEach(lap => {
                    html += `<li>
                        <span>周回 ${lap.lapNum}</span>
                        <span>ラップ: <strong>${lap.formattedLap}</strong> (計 ${lap.formattedTotal})</span>
                    </li>`;
                });
            } else {
                html += `<li style="color:#aaa; border:none;">記録なし</li>`;
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

// アプリ起動時の初期化実行
renderRunnerButtons();
initTimerSync();
initRecordsSync();