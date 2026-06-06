// ==================== 账号管理 ====================
const ADMIN_ACCOUNT = "admin@school.com";
const defaultAccounts = { [ADMIN_ACCOUNT]: "123456" };

function loadRegisteredAccounts() {
    const stored = localStorage.getItem("yearbook_registered_accounts");
    if (stored) return JSON.parse(stored);
    else { saveRegisteredAccounts(defaultAccounts); return { ...defaultAccounts }; }
}
function saveRegisteredAccounts(accounts) { localStorage.setItem("yearbook_registered_accounts", JSON.stringify(accounts)); }

let validAccounts = loadRegisteredAccounts();
let currentLoggedInUser = null;  // 存储当前登录的账号（原始字符串）

// DOM 元素
const loginPanel = document.getElementById('loginPanel');
const contentPanel = document.getElementById('contentPanel');
const loginAccount = document.getElementById('loginAccount');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const yearTitle = document.getElementById('yearTitle');
const pdfContainer = document.getElementById('pdfContainer');
const yearSelect = document.getElementById('yearSelect');
const adminPanel = document.getElementById('adminPanel');
const totalUsersCountSpan = document.getElementById('totalUsersCount');
const userListContainer = document.getElementById('userListContainer');
const refreshAdminBtn = document.getElementById('refreshAdminBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const regAccount = document.getElementById('regAccount');
const regPassword = document.getElementById('regPassword');
const regConfirmPassword = document.getElementById('regConfirmPassword');
const registerBtn = document.getElementById('registerBtn');

// ==================== 年份下拉菜单 ====================
function populateYearSelect() {
    if (!yearSelect) return;
    yearSelect.innerHTML = '';
    for (let y = 2020; y <= 2026; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
    }
    yearSelect.value = "2026";
}

// ==================== PDF.js 渲染（保持文本可选 + 水印）====================
async function renderPdfWithPdfJs(year) {
    if (!pdfContainer) return;
    yearTitle.textContent = `${year} Yearbook`;
    pdfContainer.innerHTML = '<div class="loading" style="text-align:center; padding:40px;">加载年鉴中，请稍候...</div>';
    
    const pdfUrl = `pdfs/${year}.pdf`;
    try {
        // 加载 PDF 文档
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        // 清空容器
        pdfContainer.innerHTML = '';
        pdfContainer.style.position = 'relative';
        
        // 存储所有页面元素，以便后续添加水印
        const pageElements = [];
        
        // 逐页渲染
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 }); // 缩放比例
            
            // 创建包裹单页的容器
            const pageDiv = document.createElement('div');
            pageDiv.style.position = 'relative';
            pageDiv.style.margin = '0 auto 20px auto';
            pageDiv.style.width = '100%';
            pageDiv.style.maxWidth = `${viewport.width}px`;
            
            // 创建 canvas
            const canvas = document.createElement('canvas');
            canvas.classList.add('pdf-page-canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            
            // 渲染 canvas
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            pageDiv.appendChild(canvas);
            
            // ---- 创建文本图层（使文字可选）----
            const textLayerDiv = document.createElement('div');
            textLayerDiv.classList.add('textLayer');
            textLayerDiv.style.position = 'absolute';
            textLayerDiv.style.left = '0';
            textLayerDiv.style.top = '0';
            textLayerDiv.style.right = '0';
            textLayerDiv.style.bottom = '0';
            textLayerDiv.style.overflow = 'hidden';
            textLayerDiv.style.opacity = '1';   // 完全可见，用户才能选文字
            textLayerDiv.style.pointerEvents = 'auto'; // 允许选择文本
            
            // 获取文本内容
            const textContent = await page.getTextContent();
            // 使用 PDF.js 内置的 renderTextLayer 方法
            const renderTextLayer = (pdfjsLib.renderTextLayer) ? pdfjsLib.renderTextLayer : 
                (await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf_viewer.min.js')).renderTextLayer;
            
            // 简单起见，我们手动实现一个基础文本层（确保可选）
            // 更可靠的方式：使用 PDF.js 的 renderTextLayer
            if (typeof pdfjsLib.renderTextLayer === 'function') {
                const textLayer = pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: []
                });
                await textLayer;
            } else {
                // 降级：简单的文本放置
                const fragments = document.createDocumentFragment();
                for (const item of textContent.items) {
                    const div = document.createElement('div');
                    div.textContent = item.str;
                    div.style.position = 'absolute';
                    div.style.left = `${item.transform[4]}px`;
                    div.style.top = `${item.transform[5]}px`;
                    div.style.fontSize = `${item.height}px`;
                    div.style.color = 'transparent'; // 让文字透明，但可选
                    div.style.userSelect = 'text';
                    fragments.appendChild(div);
                }
                textLayerDiv.appendChild(fragments);
            }
            
            pageDiv.appendChild(textLayerDiv);
            pdfContainer.appendChild(pageDiv);
            pageElements.push(pageDiv);
        }
        
        // 添加全局水印（覆盖整个 pdfContainer）
        addWatermarkOverlay(currentLoggedInUser);
        
    } catch (err) {
        console.error(err);
        pdfContainer.innerHTML = `<p class="hint">⚠️ 无法加载 ${year} 年年鉴，请检查文件是否存在（pdfs/${year}.pdf）。</p>`;
    }
}

// 添加水印层（绝对定位覆盖）
function addWatermarkOverlay(username) {
    if (!username) return;
    // 检查是否已存在水印层
    if (document.getElementById('pdf-watermark')) return;
    const watermarkDiv = document.createElement('div');
    watermarkDiv.id = 'pdf-watermark';
    watermarkDiv.style.position = 'absolute';
    watermarkDiv.style.top = '0';
    watermarkDiv.style.left = '0';
    watermarkDiv.style.width = '100%';
    watermarkDiv.style.height = '100%';
    watermarkDiv.style.pointerEvents = 'none';
    watermarkDiv.style.zIndex = '1000';
    watermarkDiv.style.display = 'flex';
    watermarkDiv.style.justifyContent = 'center';
    watermarkDiv.style.alignItems = 'center';
    watermarkDiv.style.flexDirection = 'column';
    watermarkDiv.style.color = 'rgba(0,0,0,0.1)';
    watermarkDiv.style.fontSize = '3rem';
    watermarkDiv.style.fontWeight = 'bold';
    watermarkDiv.style.transform = 'rotate(-25deg)';
    watermarkDiv.style.whiteSpace = 'pre';
    watermarkDiv.style.fontFamily = 'Arial, sans-serif';
    watermarkDiv.innerText = `${username}\n${new Date().toLocaleDateString()}`;
    watermarkDiv.style.textAlign = 'center';
    
    // 确保 pdfContainer 是相对定位
    pdfContainer.style.position = 'relative';
    pdfContainer.appendChild(watermarkDiv);
}

// ==================== 登录/注册逻辑 ====================
function login(account, password) {
    const lowerAcc = account.trim().toLowerCase();
    const found = Object.keys(validAccounts).find(k => k.toLowerCase() === lowerAcc);
    if (found && validAccounts[found] === password) {
        currentLoggedInUser = found;   // 保留原始大小写
        localStorage.setItem('yearbook_current_user', found);
        loginPanel.style.display = 'none';
        contentPanel.style.display = 'block';
        populateYearSelect();
        // 默认加载 2026 年年鉴
        renderPdfWithPdfJs(yearSelect.value);
        if (found.toLowerCase() === ADMIN_ACCOUNT.toLowerCase()) renderAdminPanel();
        else if (adminPanel) adminPanel.style.display = 'none';
    } else {
        alert('账号或密码错误');
    }
}

function logout() {
    currentLoggedInUser = null;
    localStorage.removeItem('yearbook_current_user');
    loginPanel.style.display = 'block';
    contentPanel.style.display = 'none';
    loginAccount.value = '';
    loginPassword.value = '';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'none';
}

function register(account, password, confirm) {
    const acc = account.trim();
    if (!acc || !password || !confirm) { alert('请填写完整'); return false; }
    if (password.length < 6) { alert('密码至少6位'); return false; }
    if (password !== confirm) { alert('两次密码不一致'); return false; }
    const accounts = loadRegisteredAccounts();
    if (Object.keys(accounts).some(k => k.toLowerCase() === acc.toLowerCase())) { alert('账号已存在'); return false; }
    accounts[acc] = password;
    saveRegisteredAccounts(accounts);
    validAccounts = accounts;
    alert('注册成功，请登录');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    loginAccount.value = acc;
    loginPassword.value = '';
    return true;
}

// ==================== 管理员面板 ====================
function renderAdminPanel() {
    if (!currentLoggedInUser || currentLoggedInUser.toLowerCase() !== ADMIN_ACCOUNT.toLowerCase()) {
        if (adminPanel) adminPanel.style.display = 'none';
        return;
    }
    adminPanel.style.display = 'block';
    const accounts = loadRegisteredAccounts();
    const userList = Object.keys(accounts);
    totalUsersCountSpan.textContent = userList.length;
    let html = '<table class="user-table"><thead><tr><th>账号</th><th>操作</th></tr></thead><tbody>';
    userList.forEach(acc => {
        html += `<tr><td>${escapeHtml(acc)}</td><td><button class="delete-user-btn small-btn" data-account="${escapeHtml(acc)}">删除</button></td></tr>`;
    });
    html += '</tbody></table>';
    userListContainer.innerHTML = html;
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const acc = btn.getAttribute('data-account');
            if (acc === ADMIN_ACCOUNT) { alert('不能删除管理员'); return; }
            if (confirm(`删除账号 ${acc}？`)) deleteUserAccount(acc);
        });
    });
}
function escapeHtml(str) { return str.replace(/[&<>]/g, function(m) { return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'; }); }
function deleteUserAccount(account) {
    const accounts = loadRegisteredAccounts();
    if (accounts[account]) { delete accounts[account]; saveRegisteredAccounts(accounts); validAccounts = accounts; renderAdminPanel(); alert('已删除'); }
    else alert('账号不存在');
}

// ==================== 事件绑定 ====================
loginBtn.addEventListener('click', (e) => { e.preventDefault(); login(loginAccount.value, loginPassword.value); });
logoutBtn?.addEventListener('click', logout);
showRegisterBtn?.addEventListener('click', () => { loginForm.style.display = 'none'; registerForm.style.display = 'block'; });
showLoginBtn?.addEventListener('click', () => { registerForm.style.display = 'none'; loginForm.style.display = 'block'; });
registerBtn?.addEventListener('click', () => register(regAccount.value, regPassword.value, regConfirmPassword.value));
refreshAdminBtn?.addEventListener('click', renderAdminPanel);
yearSelect?.addEventListener('change', (e) => { if (e.target.value) renderPdfWithPdfJs(e.target.value); });
document.querySelector('.decade')?.addEventListener('click', () => yearSelect?.focus());

// 自动填充上次登录账号
const savedUser = localStorage.getItem('yearbook_current_user');
if (savedUser && loginAccount) loginAccount.value = savedUser;
loginPanel.style.display = 'block';
contentPanel.style.display = 'none';

// ==================== 禁用下载/打印/右键 ====================
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const save = (isMac && e.metaKey && e.key === 's') || (!isMac && e.ctrlKey && e.key === 's');
    const print = (isMac && e.metaKey && e.key === 'p') || (!isMac && e.ctrlKey && e.key === 'p');
    if (save) { e.preventDefault(); alert('下载功能已被禁用。如需获取 PDF 原件，请联系管理员。'); return false; }
    if (print) { e.preventDefault(); alert('打印功能已被禁用。'); return false; }
});