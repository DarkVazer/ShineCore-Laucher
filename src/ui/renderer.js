// renderer.js - Логика интерфейса лаунчера

// Перехват console.log для отправки в консоль отладки
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

const sendToConsole = (level, ...args) => {
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    // Отправляем в консоль отладки через IPC
    if (window.electronAPI && window.electronAPI.sendConsoleLog) {
        const logEntry = {
            level: level,
            message: message,
            timestamp: new Date(),
            source: 'renderer'
        };
        
        // Отправляем асинхронно, не блокируя основной поток
        setTimeout(() => {
            try {
                window.electronAPI.sendConsoleLog(logEntry);
            } catch (err) {
                // Игнорируем ошибки отправки
            }
        }, 0);
    }

    return message;
};

console.log = (...args) => {
    const message = sendToConsole('info', ...args);
    originalConsole.log.apply(console, args);
};

console.info = (...args) => {
    const message = sendToConsole('info', ...args);
    originalConsole.info.apply(console, args);
};

console.warn = (...args) => {
    const message = sendToConsole('warning', ...args);
    originalConsole.warn.apply(console, args);
};

console.error = (...args) => {
    const message = sendToConsole('error', ...args);
    originalConsole.error.apply(console, args);
};

console.debug = (...args) => {
    const message = sendToConsole('debug', ...args);
    originalConsole.debug.apply(console, args);
};

console.log('Renderer process started - console.log interception active');

let selectedVersion = null;
let versions = [];
let installedVersions = new Set();
let isDownloading = false;
let currentConfig = { nick: 'Player', ram: 4 };
let currentBackground = { type: 'default', path: '../assets/background.webm' };

// === Electron API ===
document.getElementById('minimize').onclick = () => window.electronAPI.close(); // Всегда скрываем в трей
document.getElementById('maximize').onclick = () => window.electronAPI.maximize();
document.getElementById('close').onclick = () => window.electronAPI.close();

// === Фон лаунчера ===
async function loadBackground() {
  try {
    console.log('Loading background from main process...');
    currentBackground = await window.electronAPI.getBackground();
    console.log('Loaded background:', currentBackground);
    applyBackground(currentBackground);
  } catch (err) {
    console.error('Failed to load background:', err);
    console.error('Error details:', err.stack);
  }
}

function applyBackground(background) {
  const videoElement = document.querySelector('.background-video');
  const customBackgroundElement = document.getElementById('customBackground');
  const overlayElement = document.querySelector('.overlay');
  
  if (!videoElement || !customBackgroundElement || !overlayElement) {
    console.error('Background elements not found:', { videoElement, customBackgroundElement, overlayElement });
    return;
  }
  
  console.log('Applying background:', background);
  console.log('Background type:', background.type);
  console.log('Background path:', background.path);
  
  // Добавляем анимацию смены фона
  videoElement.classList.add('fade-in');
  customBackgroundElement.classList.add('fade-in');
  
  try {
    if (background.type === 'default') {
      // Стандартный фон (видео)
      console.log('Setting default background (video)');
      
      // Полностью останавливаем и очищаем пользовательский фон
      customBackgroundElement.classList.remove('active');
      customBackgroundElement.innerHTML = '';
      customBackgroundElement.style.backgroundImage = '';
      
      // Показываем и запускаем стандартное видео
      videoElement.style.display = 'block';
      videoElement.innerHTML = '';
      const source = document.createElement('source');
      source.src = background.path;
      source.type = 'video/webm';
      videoElement.appendChild(source);
      videoElement.load();
      videoElement.play().catch(e => console.log('Video autoplay prevented:', e));
      
    } else if (background.type === 'image') {
      // Изображение как фон
      console.log('Setting image background:', background.path);
      
      // Полностью останавливаем и скрываем стандартное видео
      videoElement.pause();
      videoElement.currentTime = 0;
      videoElement.style.display = 'none';
      videoElement.innerHTML = '';
      
      // Для пользовательских файлов всегда используем file:// протокол
      let fileUrl;
      if (background.path.startsWith('file://')) {
        // Уже содержит file://
        fileUrl = background.path;
      } else {
        // Добавляем file:// к абсолютному пути
        fileUrl = `file://${background.path}`;
      }
      
      console.log('Image file URL:', fileUrl);
      
      // Создаем изображение для проверки загрузки
      const img = new Image();
      img.onload = function() {
        console.log('Image loaded successfully');
        // Устанавливаем изображение как фон в пользовательском элементе
        customBackgroundElement.style.backgroundImage = `url('${fileUrl}')`;
        customBackgroundElement.style.backgroundSize = 'cover';
        customBackgroundElement.style.backgroundPosition = 'center';
        customBackgroundElement.style.backgroundRepeat = 'no-repeat';
        customBackgroundElement.classList.add('active');
        console.log('Custom background image set successfully');
      };
      img.onerror = function() {
        console.error('Failed to load image:', fileUrl);
        console.error('Image error details:', img.error);
        // Пробуем загрузить стандартный фон при ошибке
        applyBackground({ type: 'default', path: '../assets/background.webm' });
      };
      img.src = fileUrl;
      
      // Также устанавливаем фон сразу (на случай если onload не сработает)
      customBackgroundElement.style.backgroundImage = `url('${fileUrl}')`;
      customBackgroundElement.style.backgroundSize = 'cover';
      customBackgroundElement.style.backgroundPosition = 'center';
      customBackgroundElement.style.backgroundRepeat = 'no-repeat';
      customBackgroundElement.classList.add('active');
      console.log('Custom background image set immediately');
      
    } else if (background.type === 'video') {
      // Видео как фон
      console.log('Setting video background');
      
      // Полностью останавливаем и скрываем стандартное видео
      videoElement.pause();
      videoElement.currentTime = 0;
      videoElement.style.display = 'none';
      videoElement.innerHTML = '';
      
      // Для пользовательских файлов всегда используем file:// протокол
      let fileUrl;
      if (background.path.startsWith('file://')) {
        // Уже содержит file://
        fileUrl = background.path;
      } else {
        // Добавляем file:// к абсолютному пути
        fileUrl = `file://${background.path}`;
      }
      
      console.log('Video file URL:', fileUrl);
      
      // Создаем видео элемент в пользовательском фоне
      customBackgroundElement.innerHTML = '';
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      
      const source = document.createElement('source');
      source.src = fileUrl;
      
      // Определяем тип видео по расширению
      const ext = background.path.split('.').pop().toLowerCase();
      console.log('Video extension:', ext);
      if (ext === 'webm') {
        source.type = 'video/webm';
      } else if (ext === 'mp4') {
        source.type = 'video/mp4';
      } else {
        source.type = 'video/mp4'; // По умолчанию
      }
      
      video.appendChild(source);
      customBackgroundElement.appendChild(video);
      customBackgroundElement.classList.add('active');
      
      // Принудительно загружаем и запускаем видео
      video.load();
      
      // Добавляем обработчики ошибок для видео
      video.onerror = function(e) {
        console.error('Custom video element error:', e);
        console.error('Custom video source:', fileUrl);
        // Пробуем загрузить стандартный фон при ошибке
        applyBackground({ type: 'default', path: '../assets/background.webm' });
      };
      
      video.onloadstart = function() {
        console.log('Custom video loading started');
      };
      
      video.oncanplay = function() {
        console.log('Custom video can play, starting playback');
        video.play().catch(e => {
          console.error('Custom video play error:', e);
          console.error('Custom video source:', fileUrl);
          // Пробуем загрузить стандартный фон при ошибке
          applyBackground({ type: 'default', path: '../assets/background.webm' });
        });
      };
      
      // Также пытаемся запустить сразу
      setTimeout(() => {
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA или выше
          video.play().catch(e => {
            console.log('Video not ready yet, waiting for canplay event');
          });
        }
      }, 100);
    }
  } catch (error) {
    console.error('Error applying background:', error);
    // При любой ошибке возвращаемся к стандартному фону
    applyBackground({ type: 'default', path: '../assets/background.webm' });
  }
  
  // Убираем класс анимации после завершения
  setTimeout(() => {
    videoElement.classList.remove('fade-in');
    customBackgroundElement.classList.remove('fade-in');
    console.log('Background animation completed');
  }, 500);
}

// Слушаем изменения фона
window.electronAPI.onBackgroundChanged((background) => {
  console.log('Received background-changed event:', background);
  currentBackground = background;
  applyBackground(background);
});

// Загружаем фон при старте
loadBackground();

// === Welcome → Launcher ===
document.getElementById('startButton').onclick = () => {
  document.getElementById('welcomeScreen').classList.add('fade-out');
  setTimeout(() => {
    document.getElementById('welcomeScreen').style.display = 'none';
    const launcher = document.getElementById('launcherInterface');
    launcher.style.display = 'flex';
    launcher.classList.add('active');
    loadMainSection();
  }, 500);
};

// === Навигация ===
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item');
  if (!navItem) return;

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  navItem.classList.add('active');

  const section = navItem.dataset.section;
  if (section === 'main') loadMainSection();
  else if (section === 'versions') loadVersionsSection();
  else if (section === 'settings') loadSettings();
});

// ============================================
// === ГЛАВНАЯ (Личная сборка) ===
// ============================================
async function loadMainSection() {
  const content = document.getElementById('mainContent');
  content.innerHTML = `
    <div class="version-section">
      <h2>ShineCore</h2>
      <p class="subtitle" id="modpackSubtitle">Загрузка информации о сборке...</p>
      <div class="modpack-info" id="modpackInfo"></div>
    </div>
    <div class="divider"></div>
    <div class="launch-section">
      <button class="launch-button" id="launchBtn" disabled>
        <span class="progress-percent" id="progressPercent"></span>
        <div class="launch-button-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span id="launchText">Загрузка...</span>
        </div>
        <div class="stage-text" id="stageText"></div>
        <div class="progress-bar" id="progressBar" style="transform: scaleX(0)"></div>
      </button>
    </div>
    <div class="info-panel">
      <div class="info-item">
        <div class="info-label">Ник игрока</div>
        <input type="text" class="player-nick-input" id="playerNick" placeholder="Введите ник" value="Player">
      </div>
    </div>
  `;

  try {
    currentConfig = await window.electronAPI.getConfig();
    document.getElementById('playerNick').value = currentConfig.nick || 'Player';
  } catch (e) {
    console.error('Config load error:', e);
  }

  // Загружаем информацию о сборке
  try {
    const manifest = await window.electronAPI.getModpackManifest();
    const installed = await window.electronAPI.checkModpackInstalled();
    
    const subtitle = document.getElementById('modpackSubtitle');
    const info = document.getElementById('modpackInfo');
    const btn = document.getElementById('launchBtn');
    const text = document.getElementById('launchText');
    
    subtitle.textContent = manifest.description || 'Персональная сборка с модами';
    
    info.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px;">
        <div class="info-badge">
          <span class="info-badge-label">Minecraft</span>
          <span class="info-badge-value">${manifest.minecraft}</span>
        </div>
        <div class="info-badge">
          <span class="info-badge-label">Загрузчик</span>
          <span class="info-badge-value">${manifest.loader === 'none' ? 'Vanilla' : manifest.loader.charAt(0).toUpperCase() + manifest.loader.slice(1)}</span>
        </div>
        <div class="info-badge">
          <span class="info-badge-label">Java</span>
          <span class="info-badge-value">${manifest.java_version}</span>
        </div>
        <div class="info-badge">
          <span class="info-badge-label">Файлов</span>
          <span class="info-badge-value">${manifest.files?.length || 0}</span>
        </div>
      </div>
    `;
    
    if (installed.versionInstalled) {
      btn.disabled = false;
      text.textContent = 'Играть';
    } else {
      btn.disabled = false;
      text.textContent = 'Установить сборку';
    }
    
    btn.onclick = () => handleModpackLaunch(installed.versionInstalled);
    
  } catch (err) {
    console.error('Failed to load modpack info:', err);
    document.getElementById('modpackSubtitle').textContent = 'Ошибка загрузки сборки';
    document.getElementById('modpackInfo').innerHTML = `
      <div style="color: var(--error); margin-top: 12px;">
        ${err.message || 'Не удалось подключиться к серверу'}
      </div>
    `;
    document.getElementById('launchText').textContent = 'Недоступно';
  }

  document.getElementById('playerNick').oninput = async () => {
    const nick = document.getElementById('playerNick').value.trim();
    if (nick) {
      await window.electronAPI.saveNick(nick);
    }
  };
}

async function handleModpackLaunch(versionInstalled) {
  const btn = document.getElementById('launchBtn');
  const text = document.getElementById('launchText');
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const nick = document.getElementById('playerNick').value.trim() || 'Player';

  btn.disabled = true;

  try {
    if (!versionInstalled) {
      // Полная установка сборки
      text.textContent = 'Установка...';
      stageText.textContent = 'Подготовка';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '0%';

      await window.electronAPI.downloadModpack();

      text.textContent = 'Запуск...';
      stageText.textContent = 'Запуск игры';
    } else {
      // Версия установлена - запускаем с автоматической проверкой целостности
      text.textContent = 'Проверка...';
      stageText.textContent = 'Проверка файлов';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '0%';

      await window.electronAPI.downloadModpack();

      text.textContent = 'Запуск...';
      stageText.textContent = 'Запуск игры';
    }

    // Запускаем
    const result = await window.electronAPI.launchModpack({ nick });

    if (result.success) {
      text.textContent = 'Запущено!';
      stageText.textContent = 'Игра запущена';
      progressBar.style.transform = 'scaleX(1)';
      progressPercent.textContent = '100%';
    } else {
      throw new Error(result.error || 'Ошибка запуска');
    }
  } catch (err) {
    console.error('Modpack launch error:', err);
    text.textContent = 'Ошибка';
    stageText.textContent = err.message;
    progressBar.style.transform = 'scaleX(0)';
    progressPercent.textContent = '';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      text.textContent = 'Играть';
      stageText.textContent = '';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '';
    }, 3000);
  }
}

// Слушаем прогресс установки модпака
window.electronAPI.onModpackProgress(progress => {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');

  if (!progressBar || !stageText || !progressPercent) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  
  if (progress.stage) {
    if (progress.total > 1) {
      stageText.textContent = `${progress.stage} (${progress.current}/${progress.total})`;
    } else {
      stageText.textContent = progress.stage;
    }
  }
});

// Слушаем прогресс загрузки Java
window.electronAPI.onJavaProgress(progress => {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const launchText = document.getElementById('launchText');

  if (!progressBar || !stageText || !progressPercent || !launchText) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  
  // Отображаем детальную информацию о загрузке Java
  if (progress.stage) {
    stageText.textContent = progress.stage;
    
    // Обновляем текст кнопки в зависимости от этапа Java
    if (progress.stage.includes('Загрузка Java')) {
      launchText.textContent = 'Загрузка Java...';
    } else if (progress.stage.includes('Распаковка Java')) {
      launchText.textContent = 'Распаковка Java...';
    } else if (progress.stage.includes('Настройка Java')) {
      launchText.textContent = 'Настройка Java...';
    } else if (progress.stage.includes('Java установлена') || progress.stage.includes('Java уже установлена')) {
      launchText.textContent = 'Java готова';
    }
  }
});

// ============================================
// === ВЕРСИИ (Ванильный Minecraft) ===
// ============================================
async function loadVersionsSection() {
  const content = document.getElementById('mainContent');
  content.innerHTML = `
    <div class="version-section">
      <h2>Версии Minecraft</h2>
      <p class="subtitle">Выберите и установите любую версию ванильного Minecraft</p>
      <div class="version-info">
        <div class="version-selector">
          <div class="version-dropdown" id="versionDropdown">Выберите версию</div>
          <div class="version-list" id="versionList"></div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="launch-section">
      <button class="launch-button" id="launchBtn" disabled>
        <span class="progress-percent" id="progressPercent"></span>
        <div class="launch-button-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span id="launchText">Выберите версию</span>
        </div>
        <div class="stage-text" id="stageText"></div>
        <div class="progress-bar" id="progressBar" style="transform: scaleX(0)"></div>
      </button>
      <button class="refresh-button" id="refreshBtn" title="Обновить список версий">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M1 4v6h6M23 20v-6h-6M20.3 5.51C18.52 3.5 15.99 2 13 2c-5.25 0-9.55 3.06-11.63 7.12h4.84c1.6-2.2 4.05-3.62 6.79-3.62 2.59 0 4.84 1.04 6.56 2.73l-3.56 3.56h8v-8l-3.7 3.7zM3.7 18.5c1.78 2.01 4.31 3.5 7.3 3.5 5.25 0 9.55-3.06 11.63-7.12h-4.84c-1.6 2.2-4.05 3.62-6.79 3.62-2.59 0-4.84-1.04-6.56-2.73l3.56-3.56h-8v8l3.7-3.7z"/>
        </svg>
      </button>
    </div>
    <div class="info-panel">
      <div class="info-item">
        <div class="info-label">Ник игрока</div>
        <input type="text" class="player-nick-input" id="playerNick" placeholder="Введите ник" value="Player">
      </div>
    </div>
  `;

  try {
    currentConfig = await window.electronAPI.getConfig();
    document.getElementById('playerNick').value = currentConfig.nick || 'Player';
  } catch (e) {
    console.error('Config load error:', e);
  }

  try {
    versions = await window.electronAPI.getVersions();
    await checkInstalledVersions();
    populateVersionList();
  } catch (e) {
    console.error('Versions load error:', e);
  }

  document.getElementById('refreshBtn').onclick = async () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('loading');
    btn.disabled = true;
    try {
      versions = await window.electronAPI.refreshVersions();
      await checkInstalledVersions();
      populateVersionList();
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  };

  document.getElementById('playerNick').oninput = async () => {
    checkLaunchReady();
    const nick = document.getElementById('playerNick').value.trim();
    if (nick) {
      await window.electronAPI.saveNick(nick);
    }
  };

  document.getElementById('versionDropdown').onclick = toggleVersionList;

  // Обработчик кнопки "Играть"
  document.getElementById('launchBtn').onclick = handleLaunchClick;
}

async function checkInstalledVersions() {
  installedVersions.clear();
  const checks = await window.electronAPI.checkInstalledVersions(versions.map(v => v.id));
  checks.forEach(item => {
    if (item.installed) {
      installedVersions.add(item.version);
    }
  });
}

function populateVersionList() {
  const list = document.getElementById('versionList');
  list.innerHTML = versions.map(v => {
    const isInstalled = installedVersions.has(v.id);
    return `
      <div class="version-item ${isInstalled ? 'installed' : ''}" data-version="${v.id}">
        <span class="version-item-text">${v.id}</span>
        ${isInstalled ? `
          <span class="version-badge">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
            Установлено
          </span>
        ` : ''}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.version-item').forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      selectVersion(item.dataset.version);
    };
  });
}

function toggleVersionList() {
  const list = document.getElementById('versionList');
  list.classList.toggle('open');
}

function selectVersion(version) {
  selectedVersion = version;
  document.getElementById('versionDropdown').textContent = version;
  document.getElementById('versionList').classList.remove('open');
  checkLaunchReady();
}

function checkLaunchReady() {
  const nick = document.getElementById('playerNick').value.trim();
  const btn = document.getElementById('launchBtn');
  const text = document.getElementById('launchText');

  if (selectedVersion && nick && !isDownloading) {
    btn.disabled = false;
    text.textContent = 'Играть';
  } else {
    btn.disabled = true;
    text.textContent = selectedVersion ? 'Введите ник' : 'Выберите версию';
  }
}

async function handleLaunchClick() {
  if (isDownloading) return;

  const nick = document.getElementById('playerNick').value.trim() || 'Player';
  const btn = document.getElementById('launchBtn');
  const text = document.getElementById('launchText');
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');

  btn.disabled = true;
  isDownloading = true;

  try {
    // Скачивание версии
    text.textContent = 'Загрузка...';
    stageText.textContent = 'Подготовка...';
    progressBar.style.transform = 'scaleX(0)';
    progressPercent.textContent = '0%';

    await window.electronAPI.downloadVersion({ versionId: selectedVersion });

    // Обновляем список установленных версий
    installedVersions.add(selectedVersion);
    populateVersionList();

    // Запуск
    text.textContent = 'Запуск...';
    stageText.textContent = 'Запуск Minecraft';
    progressBar.style.transform = 'scaleX(1)';
    progressPercent.textContent = '100%';

    await window.electronAPI.launchGame({ nick, versionId: selectedVersion });

    text.textContent = 'Запущено!';
    stageText.textContent = 'Игра запущена';
  } catch (err) {
    text.textContent = 'Ошибка';
    stageText.textContent = err.message;
    progressBar.style.transform = 'scaleX(0)';
    progressPercent.textContent = '';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      isDownloading = false;
      text.textContent = 'Играть';
      stageText.textContent = '';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '';
    }, 3000);
  }
}

// === Слушаем прогресс загрузки ===
window.electronAPI.onDownloadProgress(progress => {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const launchText = document.getElementById('launchText');

  if (!progressBar || !stageText || !progressPercent || !launchText) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  
  // Отображаем детальную информацию
  stageText.textContent = progress.stage;
  
  // Обновляем текст кнопки в зависимости от этапа
  if (progress.stage.includes('метаданных')) {
    launchText.textContent = 'Подготовка...';
  } else if (progress.stage.includes('клиента')) {
    launchText.textContent = 'Загрузка клиента...';
  } else if (progress.stage.includes('библиотек')) {
    launchText.textContent = 'Загрузка библиотек...';
  } else if (progress.stage.includes('ассетов')) {
    launchText.textContent = 'Загрузка ассетов...';
  } else if (progress.stage.includes('завершена')) {
    launchText.textContent = 'Готово!';
  } else {
    launchText.textContent = 'Установка...';
  }
});

// Слушаем прогресс установки модпака
window.electronAPI.onModpackProgress(progress => {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const launchText = document.getElementById('launchText');

  if (!progressBar || !stageText || !progressPercent || !launchText) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  
  // Отображаем детальную информацию
  stageText.textContent = progress.stage;
  
  // Обновляем текст кнопки
  if (progress.stage.includes('манифеста')) {
    launchText.textContent = 'Подготовка...';
  } else if (progress.stage.includes('базовой версии') || progress.stage.includes('Установка')) {
    launchText.textContent = 'Установка Minecraft...';
  } else if (progress.stage.includes('модпака')) {
    launchText.textContent = 'Загрузка модов...';
  } else if (progress.stage.includes('завершена')) {
    launchText.textContent = 'Готово!';
  } else {
    launchText.textContent = 'Установка...';
  }
});

// ============================================
// === НАСТРОЙКИ ===
// ============================================
async function loadSettings() {
  const content = document.getElementById('mainContent');
  
  try {
    currentConfig = await window.electronAPI.getConfig();
    currentBackground = await window.electronAPI.getBackground();
  } catch (e) {
    console.error('Config load error:', e);
  }

  content.innerHTML = `
    <div class="version-section">
      <h2>Настройки</h2>
      <p class="subtitle">Настройте параметры лаунчера и игры</p>
    </div>
    <div class="divider"></div>
    
    <div class="settings-section">
      <h3>🎨 Внешний вид</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Фон лаунчера</div>
          <div class="setting-description">Выберите изображение или видео для фона. Поддерживаются JPG, PNG, WEBM, MP4</div>
        </div>
        <div class="setting-control">
          <div class="background-controls">
            <button class="settings-button" id="selectBackgroundBtn">Выбрать файл</button>
            <button class="settings-button" id="resetBackgroundBtn">Сбросить</button>
          </div>
        </div>
      </div>
      <div class="background-preview" id="backgroundPreview">
        <div class="preview-info">
          <span id="currentBackgroundInfo">Текущий фон: ${currentBackground.type === 'default' ? 'Стандартный' : 'Пользовательский'}</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>⚙️ Производительность</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Оперативная память (RAM)</div>
          <div class="setting-description">Выделенная память для Minecraft. Рекомендуется 4-8 ГБ</div>
        </div>
        <div class="setting-control">
          <input type="range" class="ram-slider" id="ramSlider" min="1" max="16" value="${currentConfig.ram}" step="1">
          <span class="ram-value" id="ramValue">${currentConfig.ram} ГБ</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>📁 Пути и файлы</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Папка игры</div>
          <div class="setting-description">Расположение файлов Minecraft</div>
        </div>
        <div class="setting-control">
          <button class="settings-button" id="openFolderBtn">Открыть папку</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>🐞 Отладка</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Консоль отладки</div>
          <div class="setting-description">Открыть окно с логами лаунчера и Minecraft для диагностики проблем</div>
        </div>
        <div class="setting-control">
          <button class="settings-button" id="openConsoleBtn">Открыть консоль</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Расширенное логирование</div>
          <div class="setting-description">Включить подробные логи для диагностики проблем</div>
        </div>
        <div class="setting-control">
          <label class="toggle-switch">
            <input type="checkbox" id="debugLoggingToggle">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

  `;

  // Обработчики настроек
  const ramSlider = document.getElementById('ramSlider');
  const ramValue = document.getElementById('ramValue');

  ramSlider.oninput = () => {
    const ram = parseInt(ramSlider.value);
    ramValue.textContent = `${ram} ГБ`;
  };

  ramSlider.onchange = async () => {
    const ram = parseInt(ramSlider.value);
    currentConfig.ram = ram;
    try {
      await window.electronAPI.saveConfig(currentConfig);
    } catch (e) {
      console.error('Save config error:', e);
    }
  };

  // Обработчики отладки
  document.getElementById('openConsoleBtn').onclick = () => {
    window.electronAPI.openConsole();
  };

  const debugToggle = document.getElementById('debugLoggingToggle');
  debugToggle.checked = currentConfig.debugLogging || false;
  debugToggle.onchange = async () => {
    currentConfig.debugLogging = debugToggle.checked;
    try {
      await window.electronAPI.saveConfig(currentConfig);
      if (debugToggle.checked) {
        console.log('Расширенное логирование включено');
      } else {
        console.log('Расширенное логирование выключено');
      }
    } catch (e) {
      console.error('Save config error:', e);
    }
  };

  // Обработчики фона
  document.getElementById('selectBackgroundBtn').onclick = selectBackgroundFile;
  document.getElementById('resetBackgroundBtn').onclick = resetBackground;

  document.getElementById('openFolderBtn').onclick = () => {
    window.electronAPI.openFolder();
  };
}

// Функция выбора файла фона
async function selectBackgroundFile() {
  try {
    console.log('Starting background file selection');
    
    // Используем Electron API для выбора файла вместо HTML input
    const result = await window.electronAPI.selectBackgroundFile();
    console.log('File selection result:', result);
    
    if (!result || !result.filePaths || result.filePaths.length === 0) {
      console.log('No file selected');
      return;
    }
    
    const filePath = result.filePaths[0];
    console.log('Selected file path:', filePath);
    
    if (!filePath) {
      console.error('File path is undefined');
      alert('Ошибка: не удалось получить путь к файлу');
      return;
    }
    
    // Проверяем тип файла по расширению
    const fileName = filePath.toLowerCase();
    const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png');
    const isVideo = fileName.endsWith('.webm') || fileName.endsWith('.mp4');
    
    console.log('File analysis:', { fileName, isImage, isVideo });
    
    if (!isImage && !isVideo) {
      alert('Пожалуйста, выберите файл изображения (JPG, PNG) или видео (WEBM, MP4)');
      return;
    }
    
    // Показываем индикатор загрузки
    const selectBtn = document.getElementById('selectBackgroundBtn');
    const originalText = selectBtn.textContent;
    selectBtn.textContent = 'Загрузка...';
    selectBtn.disabled = true;
    
    try {
      // Сохраняем настройки фона
      const backgroundConfig = {
        type: isImage ? 'image' : 'video',
        path: filePath
      };
      
      console.log('Sending background config to main process:', backgroundConfig);
      
      const setResult = await window.electronAPI.setBackground(backgroundConfig);
      console.log('Background set result:', setResult);
      
      if (setResult.success) {
        // Обновляем текущий фон
        currentBackground = setResult.background || backgroundConfig;
        console.log('Updated current background:', currentBackground);
        
        // Применяем новый фон
        applyBackground(currentBackground);
        
        // Обновляем UI
        document.getElementById('currentBackgroundInfo').textContent = 'Текущий фон: Пользовательский';
        alert('Фон успешно изменен!');
      } else {
        alert('Ошибка при изменении фона: ' + setResult.error);
      }
    } catch (err) {
      console.error('Failed to set background:', err);
      console.error('Error details:', err.stack);
      alert('Ошибка при изменении фона: ' + err.message);
    } finally {
      // Восстанавливаем кнопку
      selectBtn.textContent = originalText;
      selectBtn.disabled = false;
    }
    
  } catch (err) {
    console.error('Background selection error:', err);
    console.error('Error details:', err.stack);
    alert('Ошибка при выборе файла: ' + err.message);
  }
}

// Функция сброса фона
async function resetBackground() {
  try {
    console.log('Resetting background...');
    const result = await window.electronAPI.resetBackground();
    console.log('Reset background result:', result);
    
    if (result.success) {
      // Обновляем текущий фон
      currentBackground = { type: 'default', path: '../assets/background.webm' };
      console.log('Updated current background:', currentBackground);
      
      // Применяем стандартный фон
      applyBackground(currentBackground);
      
      // Обновляем UI
      document.getElementById('currentBackgroundInfo').textContent = 'Текущий фон: Стандартный';
      alert('Фон сброшен к стандартному');
    } else {
      alert('Ошибка при сбросе фона: ' + result.error);
    }
  } catch (err) {
    console.error('Failed to reset background:', err);
    console.error('Error details:', err.stack);
    alert('Ошибка при сбросе фона: ' + err.message);
  }
}