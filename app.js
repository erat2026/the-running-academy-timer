import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, push, onValue, remove, runTransaction } from "firebase/database";

// 📋 ユーザー提供のFirebase設定コード (databaseURLを補完)
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

// 🔊 チャット用効果音 (ブラウザ標準の電子音)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // ピッという高めの音
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// 🔋 バッテリー思いやりタイマー (30分操作なしで警告)
let idleTime = 0;
setInterval(() => {
    if (currentUser) {
        idleTime++;
        if (idleTime >= 30) { // 30分間操作なし
            alert("⚠️ 待機時間のお知らせ\nしばらく操作がありませんでした。画面を開いたままにするとバッテリーを消費するため、今は使わない場合は画面を閉じるかスリープにしてください🔋");
            idleTime = 0;
        }
    }
}, 60000); // 1分ごとにチェック
function resetIdle() { idleTime = 0; }
window.addEventListener("click", resetIdle);
window.addEventListener("keypress", resetIdle);

// 🚪 画面要素の取得
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const welcomeMsg = document.getElementById("welcome-msg");

// 🟢 ログインチェック処理
if (currentUser) {
    showApp();
}

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
    
    // 👣 対策1：ログイン足跡ログの書き込み (直近20件制限用)
    const logRef = ref(db, "logs");
    runTransaction(logRef, (currentLogs) => {
        let logsArray = currentLogs ? Object.values(currentLogs) : [];
        const timestamp = new Date().toLocaleString("ja-JP");
        logsArray.push(`${timestamp} - ${currentUser} がログインしました`);
        if (logsArray.length > 20) {
            logsArray.shift(); // 20件を超えたら古いものを削除
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

// 📡 Firebaseリアルタイム同期の接続設定
function initRoomListeners() {
    const roomPath = `rooms/room_${currentRoom}/group_${currentGroup}`;
    
    // 📝 メモ欄のリアルタイム同期
    onValue(ref(db, `rooms/room_${currentRoom}/memo`), (snapshot) => {
        document.getElementById("room-memo").value = snapshot.val() || "";
    });

    // ⏱️ タイム一覧とロック状態の同期
    onValue(ref(db, `${roomPath}/times`), (snapshot) => {
        const timeList = document.getElementById("time-list");
        timeList.innerHTML = "";
        const data = snapshot.val();
        if (!data) {
            timeList.innerHTML = "<p>記録されたタイムはまだありません。</p>";
            return;
        }
        
        Object.keys(data).forEach(key => {
            const item = data[key];
            const div = document.createElement("div");
            div.className = "time-item";
            
            // 自分または他人がロックしているかの判定
            const isLockedByMe = item.lockedBy === currentUser;
            const isLockedByOthers = item.lockedBy && !isLockedByMe;
            
            if (isLockedByOthers) {
                div.classList.add("locked");
            }
            
            div.innerHTML = `
                <span>⏱️ <strong>${item.time}</strong> ${isLockedByOthers ? `<span class="lock-badge">🔒 ${item.lockedBy}さんが選択中...</span>` : ''}</span>
                <div>
                    <button class="trash-btn" data-key="${key}">🗑️ 消去</button>
                </div>
            `;
            
            // タップでロック/アンロックを切り替え
            div.addEventListener("click", (e) => {
                if (e.target.classList.contains("trash-btn")) return; // ゴミ箱クリック時は無視
                if (isLockedByOthers) return; // 他人がロック中は触れない
                
                const newLock = isLockedByMe ? null : currentUser;
                set(ref(db, `${roomPath}/times/${key}/lockedBy`), newLock);
            });

            // 🗑️ ゴミ箱ボタンの処理
            div.querySelector(".trash-btn").addEventListener("click", () => {
                if (confirm("このタイムを削除してもよろしいですか？")) {
                    remove(ref(db, `${roomPath}/times/${key}`));
                }
            });
            
            timeList.appendChild(div);
        });
    });
}

// 📝 メモの入力変更を保存
document.getElementById("room-memo").addEventListener("input", (e) => {
    set(ref(db, `rooms/room_${currentRoom}/memo`), e.target.value);
});

// 🚪 ルームタブ切り替えイベント
document.querySelectorAll(".room-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
        document.querySelectorAll(".room-tab").forEach(t => t.classList.remove("active"));
        e.target.classList.add("active");
        currentRoom = e.target.getAttribute("data-room");
        initRoomListeners();
    });
});

// 🏃‍♂️ 組（レース）の切り替えイベント
document.getElementById("race-group").addEventListener("change", (e) => {
    currentGroup = e.target.value;
    initRoomListeners();
});

// 💬 チャット機能の実装 (共通ルームで全員に届くインカム)
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
        
        // 初回ロード時以外で、新しいメッセージが来たら「ピッ」と鳴らす
        if (!firstChatLoad) {
            playBeep();
        }
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
    push(ref(db, "chats"), {
        user: currentUser,
        text: text
    });
    input.value = "";
}

// 📊 Excel用CSVダウンロード機能 (最上部にルームメモを挿入)
document.getElementById("download-csv").addEventListener("click", () => {
    const roomPath = `rooms/room_${currentRoom}/group_${currentGroup}`;
    const memoVal = document.getElementById("room-memo").value || "(メモなし)";
    
    onValue(ref(db, `${roomPath}/times`), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            alert("ダウンロードするデータがありません。");
            return;
        }
        
        // 💾 最上部にルーム名とメモを表示するプロ仕様フォーマット
        let csvContent = `\uFEFF[ルーム名],ルーム ${currentRoom}\n`;
        csvContent += `[ルームメモ],${memoVal}\n`;
        csvContent += `[対象の組],第 ${currentGroup} 組\n\n`;
        csvContent += "順番,タイム,選択していた人\n";
        
        Object.values(data).forEach((item, index) => {
            csvContent += `${index + 1},${item.time},${item.lockedBy || ""}\n`;
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