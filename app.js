import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, push, onValue, remove, runTransaction } from "firebase/database";

// 📋 Firebase設定コード
const firebaseConfig = {
  apiKey: "AIzaSyDNjmjkkkm7SEfUnWJ3HPb-T_u3rZsroWc",
  authDomain: "ranning-academy-timer.firebaseapp.com",
  databaseURL: "https://ranning-academy-timer-default-rtdb.firebaseio.com",
  projectId: "ranning-academy-timer",
  storageBucket: "ranning-academy-timer.firebasestorage.app",
  messagingSenderId: "398934670018",
  appId: "1:398934670018:web:645a53f6fa25205ea3595b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 🔒 アプリ内状態管理
let currentUser = localStorage.getItem("rt_user") || "";
let currentRoom = "A";
let currentGroup = "1";
const CORRECT_PASS = "erat2026";

// ⏱️ ストップウォッチ用の変数
let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;

// 🔊 チャット用効果音
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// 🔋 バッテリー思いやりタイマー (30分操作なしで警告)
let idleTime = 0;
setInterval(() => {
    if (currentUser) {
        idleTime++;
        if (idleTime >= 30) {
            alert("⚠️ 待機時間のお知らせ\nしばらく操作がありませんでした。画面を開いたままにするとバッテリーを消費するため、今は使わない場合は画面を閉じるかスリープにしてください🔋");
            idleTime = 0;
        }
    }
}, 60000);
function resetIdle() { idleTime = 0; }
window.addEventListener("click", resetIdle);
window.addEventListener("keypress", resetIdle);

// 🚪 画面要素の取得
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const welcomeMsg = document.getElementById("welcome-msg");

if (currentUser) {
    showApp();
}

// 🔑 ログイン処理
document.getElementById("login-btn").addEventListener("click", () => {
    const pass = document.getElementById("login-pass").value;
    const name = document.getElementById("login-name").value.trim();
    
    if (pass !== CORRECT_PASS) {
        document.getElementById("login-error").textContent = "合言葉が違います。";
        return;
    }
    if (!name) {
        document.getElementById("login-error").textContent = "お名前を入力してください。";
        return;
    }
    
    currentUser = name;
    localStorage.setItem("rt_user", name);
    
    // 👣 ログイン足跡ログ
    const logRef = ref(db, "logs");
    runTransaction(logRef, (currentLogs) => {
        let logsArray = currentLogs ? Object.values(currentLogs) : [];
        const timestamp = new Date().toLocaleString("ja-JP");
        logsArray.push(`${timestamp} - ${currentUser} がログインしました`);
        if (logsArray.length > 20) {
            logsArray.shift();
        }
        return Object.assign({}, logsArray);
    });

    showApp();
});

document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("rt_user");
    location.reload();
});

function showApp() {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    welcomeMsg.textContent = `👤 担当：${currentUser}`;
    initRoomListeners();
}

// ⏱️ ストップウォッチ機能
const swDisplay = document.getElementById("sw-display");
const swStartStopBtn = document.getElementById("sw-start-stop");
const swWrapBtn = document.getElementById("sw-wrap");
const swResetBtn = document.getElementById("sw-reset");

swStartStopBtn.addEventListener("click", () => {
    if (!isRunning) {
        isRunning = true;
        swStartStopBtn.textContent = "ストップ";
        swStartStopBtn.className = "stopwatch-btn btn-stop";
        startTime = Date.now() - elapsedTime;
        timerInterval = setInterval(updateTimeDisplay, 10);
    } else {
        isRunning = false;
        swStartStopBtn.textContent = "スタート";
        swStartStopBtn.className = "stopwatch-btn btn-start";
        clearInterval(timerInterval);
    }
});

swWrapBtn.addEventListener("click", () => {
    const formattedTime = formatTime(elapsedTime);
    const roomPath = `rooms/room_${currentRoom}/group_${currentGroup}`;
    
    push(ref(db, `${roomPath}/times`), {
        time: formattedTime,
        lockedBy: null,
        runnerName: "" // 👈 初期状態は空っぽ（後から割り当て用）
    });
});

swResetBtn.addEventListener("click", () => {
    if (isRunning) return;
    elapsedTime = 0;
    swDisplay.textContent = "00:00.00";
});

function updateTimeDisplay() {
    elapsedTime = Date.now() - startTime;
    swDisplay.textContent = formatTime(elapsedTime);
}

function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let milliseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
}

// 📡 Firebaseリアルタイム同期と割り当てロジック
function initRoomListeners() {
    const roomPath = `rooms/room_${currentRoom}/group_${currentGroup}`;
    
    onValue(ref(db, `rooms/room_${currentRoom}/memo`), (snapshot) => {
        document.getElementById("room-memo").value = snapshot.val() || "";
    });

    onValue(ref(db, `${roomPath}/times`), (snapshot) => {
        const timeList = document.getElementById("time-list");
        timeList.innerHTML = "";
        const data = snapshot.val();
        if (!data) {
            timeList.innerHTML = "<p>記録されたタイムはまだありません。</p>";
            return;
        }
        
        Object.keys(data).forEach((key, index) => {
            const item = data[key];
            const div = document.createElement("div");
            div.className = "time-item";
            
            const isLockedByMe = item.lockedBy === currentUser;
            const isLockedByOthers = item.lockedBy && !isLockedByMe;
            
            if (isLockedByOthers) {
                div.classList.add("locked-item");
            }
            
            // 枠の左側（タイム表示とロック状態）
            const infoDiv = document.createElement("div");
            infoDiv.className = "time-info";
            infoDiv.innerHTML = `
                <span style="color: #888; font-size:0.8em;">#${index + 1}</span>
                <span class="time-str">${item.time}</span>
                ${item.runnerName ? `<span class="runner-badge">🏃‍♂️ ${item.runnerName}</span>` : ''}
                ${isLockedByOthers ? `<span class="locked-badge">🔒 ${item.lockedBy}が入力中...</span>` : ''}
            `;
            
            // 左側をタップしたらロック/アンロックを切り替え
            infoDiv.addEventListener("click", () => {
                if (isLockedByOthers) return;
                const newLock = isLockedByMe ? null : currentUser;
                set(ref(db, `${roomPath}/times/${key}/lockedBy`), newLock);
            });
            div.appendChild(infoDiv);

            // 枠の右側（選手名割り当て入力欄 ＆ ゴミ箱）
            const actionDiv = document.createElement("div");
            actionDiv.style.display = "flex";
            actionDiv.style.gap = "5px";
            actionDiv.style.alignItems = "center";
            
            const input = document.createElement("input");
            input.type = "text";
            input.className = "runner-input";
            input.placeholder = "選手名・ゼッケン";
            input.value = item.runnerName || "";
            
            // 他人がロック中の場合は入力欄を無効化
            if (isLockedByOthers) {
                input.disabled = true;
            }

            // 文字が打ち込まれたらリアルタイムにFirebaseへ割り当て保存 ＆ 自動ロック
            input.addEventListener("input", (e) => {
                const val = e.target.value;
                // 入力中は自動的に自分がロックした状態にする（他人の上書きを防ぐ）
                set(ref(db, `${roomPath}/times/${key}/lockedBy`), val ? currentUser : null);
                set(ref(db, `${roomPath}/times/${key}/runnerName`), val);
            });
            
            const trashBtn = document.createElement("button");
            trashBtn.className = "trash-btn";
            trashBtn.innerHTML = "🗑️";
            trashBtn.addEventListener("click", () => {
                if (confirm("このタイムを削除してもよろしいですか？")) {
                    remove(ref(db, `${roomPath}/times/${key}`));
                }
            });
            
            actionDiv.appendChild(input);
            actionDiv.appendChild(trashBtn);
            div.appendChild(actionDiv);
            
            timeList.appendChild(div);
        });
    });
}

document.getElementById("room-memo").addEventListener("input", (e) => {
    set(ref(db, `rooms/room_${currentRoom}/memo`), e.target.value);
});

document.querySelectorAll(".room-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
        document.querySelectorAll(".room-tab").forEach(t => t.classList.remove("active"));
        e.target.classList.add("active");
        currentRoom = e.target.getAttribute("data-room");
        initRoomListeners();
    });
});

document.getElementById("race-group").addEventListener("change", (e) => {
    currentGroup = e.target.value;
    initRoomListeners();
});

// 💬 インカムチャット
let firstChatLoad = true;
onValue(ref(db, "chats"), (snapshot) => {
    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = "";
    const data = snapshot.val();
    if (data) {
        Object.values(data).forEach(msg => {
            const p = document.createElement("p");
            p.style.margin = "4px 0";
            p.innerHTML = `<strong>${msg.user}:</strong> ${msg.text}`;
            chatBox.appendChild(p);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
        if (!firstChatLoad) { playBeep(); }
    }
    firstChatLoad = false;
});

document.getElementById("chat-send").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMessage();
});

function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    push(ref(db, "chats"), { user: currentUser, text: text });
    input.value = "";
}

// 📊 Excel用CSV保存（割り当てられた選手名も出力）
document.getElementById("download-csv").addEventListener("click", () => {
    const roomPath = `rooms/room_${currentRoom}/group_${currentGroup}`;
    const memoVal = document.getElementById("room-memo").value || "(メモなし)";
    
    onValue(ref(db, `${roomPath}/times`), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            alert("ダウンロードするデータがありません。");
            return;
        }
        
        let csvContent = `\uFEFF[ルーム名],ルーム ${currentRoom}\n`;
        csvContent += `[ルームメモ],${memoVal}\n`;
        csvContent += `[対象の組],第 ${currentGroup} 組\n\n`;
        csvContent += "着順,タイム,割り当てられた選手名,ロック担当者\n";
        
        Object.values(data).forEach((item, index) => {
            csvContent += `${index + 1},${item.time},${item.runnerName || ""},${item.lockedBy || ""}\n`;
        });
        
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `ルーム${currentRoom}_第${currentGroup}組_記録データ.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, { onlyOnce: true });
});