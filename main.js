"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const el = {
    app: $("app"),
    video: $("cameraVideo"),
    previewCanvas: $("previewCanvas"),
    viewfinder: $("viewfinder"),
    loading: $("cameraLoading"),
    loadingText: $("loadingText"),
    placeholder: $("cameraPlaceholder"),
    startCamera: $("startCamera"),
    liveIndicator: $("liveIndicator"),
    resolutionLabel: $("resolutionLabel"),
    gridLines: $("gridLines"),
    focusReticle: $("focusReticle"),
    scannerFrame: $("scannerFrame"),
    toggleFlash: $("toggleFlash"),
    toggleGrid: $("toggleGrid"),
    openFilters: $("openFilters"),
    openTimer: $("openTimer"),
    zoomControl: $("zoomControl"),
    modeSelector: $("modeSelector"),
    shutter: $("shutter"),
    shutterInner: $("shutterInner"),
    switchCamera: $("switchCamera"),
    galleryPlaceholder: $("galleryPlaceholder"),
    lastCaptureThumb: $("lastCaptureThumb"),
    recordingStatus: $("recordingStatus"),
    recordingTime: $("recordingTime"),
    stopRecording: $("stopRecording"),
    toast: $("toast"),
    filterTray: $("filterTray"),
    filterList: $("filterList"),
    closeFilters: $("closeFilters"),
    panelBackdrop: $("panelBackdrop"),
    settingsPanel: $("settingsPanel"),
    toolsPanel: $("toolsPanel"),
    timerPanel: $("timerPanel"),
    openSettings: $("openSettings"),
    openTools: $("openTools"),
    cameraSelect: $("cameraSelect"),
    resolutionSelect: $("resolutionSelect"),
    aspectSelect: $("aspectSelect"),
    qualitySelect: $("qualitySelect"),
    timerSelect: $("timerSelect"),
    exposureSlider: $("exposureSlider"),
    exposureValue: $("exposureValue"),
    digitalZoomToggle: $("digitalZoomToggle"),
    captureSoundToggle: $("captureSoundToggle"),
    toolQR: $("toolQR"),
    toolFilters: $("toolFilters"),
    toolGrid: $("toolGrid"),
    toolTimer: $("toolTimer"),
    toolSwitch: $("toolSwitch"),
    toolInfo: $("toolInfo"),
    qrResult: $("qrResult"),
    qrResultText: $("qrResultText"),
    copyQR: $("copyQR"),
    openQRLink: $("openQRLink"),
    closeQRResult: $("closeQRResult"),
    capabilityInfo: $("capabilityInfo"),
    review: $("captureReview"),
    reviewImage: $("reviewImage"),
    reviewVideo: $("reviewVideo"),
    reviewInfo: $("reviewInfo"),
    retakePhoto: $("retakePhoto"),
    reviewFilter: $("reviewFilter"),
    saveCapture: $("saveCapture"),
    shareCapture: $("shareCapture"),
    timerOptions: document.querySelectorAll(".timer-option"),
    zoomChips: document.querySelectorAll(".zoom-chip"),
    modeButtons: document.querySelectorAll(".mode-btn"),
    filterButtons: document.querySelectorAll(".filter-item"),
    closePanelButtons: document.querySelectorAll(".close-panel"),
    secureContextLabel: $("secureContextLabel")
  };

  const required = [
    "video", "viewfinder", "shutter", "switchCamera",
    "startCamera", "review", "saveCapture", "panelBackdrop"
  ];

  for (const key of required) {
    if (!el[key]) {
      console.error("NEXORA CAMERA X: missing required element:", key);
      return;
    }
  }

  const state = {
    stream: null,
    streamGeneration: 0,
    switchPromise: null,
    starting: false,
    facingMode: "environment",
    preferredDeviceId: "",
    devices: [],
    capabilities: {},
    settings: {},
    mode: "photo",
    filter: "natural",
    grid: false,
    torch: false,
    timerSeconds: 0,
    zoom: 1,
    digitalZoom: true,
    exposure: 0,
    recording: false,
    mediaRecorder: null,
    recordingChunks: [],
    recordingStartedAt: 0,
    recordingInterval: null,
    captureBlob: null,
    captureURL: "",
    captureKind: "",
    lastCaptureURL: "",
    busy: false,
    timerInterval: null,
    toastTimer: null,
    scannerActive: false,
    barcodeDetector: null,
    scannerFrameId: 0,
    lastQRValue: "",
    qrCanvas: document.createElement("canvas"),
    qrCanvasContext: null,
    timeLapseInterval: null,
    timeLapseFrames: [],
    timeLapseStartedAt: 0,
    timeLapseCanvas: document.createElement("canvas"),
    timeLapseContext: null,
    currentPanel: "",
    destroyed: false
  };

  const FILTERS = {
    natural: "none",
    warm: "sepia(.18) saturate(1.15) brightness(1.03)",
    cool: "hue-rotate(12deg) saturate(.94) brightness(1.02)",
    vivid: "saturate(1.48) contrast(1.08)",
    soft: "saturate(.88) brightness(1.06) contrast(.9)",
    portrait: "saturate(1.12) contrast(.97) sepia(.08)",
    vintage: "sepia(.48) contrast(.92) saturate(.82)",
    cinema: "contrast(1.18) saturate(.82) brightness(.94)",
    mono: "grayscale(1)",
    fade: "contrast(.8) brightness(1.08) saturate(.72)",
    original: "none"
  };

  const FILTER_LABELS = {
    natural: "Natural",
    warm: "Warm",
    cool: "Cool",
    vivid: "Vivid",
    soft: "Soft",
    portrait: "Portrait Tone",
    vintage: "Vintage",
    cinema: "Cinema",
    mono: "Monochrome",
    fade: "Fade",
    original: "Original"
  };

  function notify(message, duration = 2800) {
    if (!el.toast) return;
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, duration);
  }

  function setLoading(visible, message = "Starting camera…") {
    el.loading.hidden = !visible;
    el.loadingText.textContent = message;
  }

  function setCameraUI(ready) {
    el.placeholder.hidden = ready;
    el.liveIndicator.hidden = !ready;
    el.shutter.disabled = !ready || state.busy;
    el.switchCamera.disabled = state.busy;
    if (ready) setLoading(false);
  }

  function getTracks(stream = state.stream) {
    return stream ? stream.getTracks() : [];
  }

  function stopStream(stream) {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (error) {
        console.warn("Could not stop track:", error);
      }
    }
  }

  function isStreamUsable(stream) {
    return !!stream &&
      stream.getVideoTracks().some(track => track.readyState === "live");
  }

  function getVideoTrack() {
    return state.stream ? state.stream.getVideoTracks()[0] || null : null;
  }

  function updateCapabilities() {
    const track = getVideoTrack();
    state.capabilities = {};
    state.settings = {};

    if (!track) {
      updateZoomUI();
      return;
    }

    try {
      state.capabilities = track.getCapabilities
        ? track.getCapabilities()
        : {};
    } catch (_) {
      state.capabilities = {};
    }

    try {
      state.settings = track.getSettings
        ? track.getSettings()
        : {};
    } catch (_) {
      state.settings = {};
    }

    state.facingMode = state.settings.facingMode || state.facingMode;

    const width = state.settings.width || 0;
    const height = state.settings.height || 0;
    el.resolutionLabel.textContent = width && height
      ? `${width} × ${height}`
      : "AUTO";

    el.toggleFlash.disabled = !(
      state.capabilities.torch && state.capabilities.torch.length
    );

    if (el.toggleFlash.disabled) {
      state.torch = false;
      el.toggleFlash.classList.remove("active");
    }

    updateZoomUI();
    updateCameraSelect();
  }

  function updateZoomUI() {
    const caps = state.capabilities || {};
    const nativeZoom = caps.zoom;
    const nativeMax = nativeZoom && Number.isFinite(nativeZoom.max)
      ? nativeZoom.max
      : 1;

    for (const button of el.zoomChips) {
      const value = Number(button.dataset.zoom);
      let allowed = value <= nativeMax + 0.001;

      if (!allowed && state.digitalZoom && state.stream) {
        allowed = value <= 10;
      }

      button.disabled = !allowed;
      button.classList.toggle("active", Math.abs(state.zoom - value) < 0.01);
      button.title = value > nativeMax
        ? "Digital zoom; detail may decrease"
        : "Camera zoom";
    }
  }

  async function listCameras() {
    if (!navigator.mediaDevices ||
        typeof navigator.mediaDevices.enumerateDevices !== "function") {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.devices = devices.filter(device => device.kind === "videoinput");
    } catch (error) {
      console.warn("Could not list camera devices:", error);
      state.devices = [];
    }

    updateCameraSelect();
    return state.devices;
  }

  function updateCameraSelect() {
    if (!el.cameraSelect) return;

    const oldValue = el.cameraSelect.value;
    el.cameraSelect.replaceChildren();

    const automatic = document.createElement("option");
    automatic.value = "";
    automatic.textContent = "Automatic";
    el.cameraSelect.appendChild(automatic);

    state.devices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      el.cameraSelect.appendChild(option);
    });

    if (state.preferredDeviceId &&
        state.devices.some(d => d.deviceId === state.preferredDeviceId)) {
      el.cameraSelect.value = state.preferredDeviceId;
    } else if (oldValue &&
               state.devices.some(d => d.deviceId === oldValue)) {
      el.cameraSelect.value = oldValue;
    } else {
      el.cameraSelect.value = "";
    }
  }

  function makeVideoConstraints(options = {}) {
    const resolution = el.resolutionSelect.value;
    const width = resolution === "1080" ? 1920
      : resolution === "720" ? 1280
      : resolution === "480" ? 640
      : undefined;

    const video = {
      frameRate: { ideal: 30 },
      aspectRatio: { ideal: 4 / 3 }
    };

    if (width) {
      video.width = { ideal: width };
      video.height = {
        ideal: Math.round(width * 3 / 4)
      };
    } else {
      video.width = { ideal: 1280 };
      video.height = { ideal: 720 };
    }

    if (options.deviceId) {
      video.deviceId = { exact: options.deviceId };
    } else {
      video.facingMode = { ideal: options.facingMode || state.facingMode };
    }

    return video;
  }

  async function requestStream(options = {}) {
    if (!navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw new Error(
        "Camera access is unavailable. Open this app in a supported browser using HTTPS or localhost."
      );
    }

    const generation = ++state.streamGeneration;
    const preferred = options.deviceId || state.preferredDeviceId || "";

    let constraints = {
      audio: false,
      video: makeVideoConstraints({
        deviceId: preferred,
        facingMode: options.facingMode || state.facingMode
      })
    };

    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (firstError) {
      if (generation !== state.streamGeneration) {
        throw new Error("Camera request superseded.");
      }

      // Retry without strict device selection if the chosen camera failed.
      if (preferred) {
        constraints = {
          audio: false,
          video: makeVideoConstraints({
            facingMode: options.facingMode || state.facingMode
          })
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        // Last-resort fallback for browsers that reject ideal constraints.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: options.facingMode || state.facingMode
          }
        });
      }
    }

    if (generation !== state.streamGeneration || state.destroyed) {
      stopStream(stream);
      throw new Error("Camera request superseded.");
    }

    const previous = state.stream;
    state.stream = stream;
    state.preferredDeviceId = preferred || "";

    el.video.srcObject = stream;

    try {
      await el.video.play();
    } catch (error) {
      if (!isStreamUsable(stream)) {
        stopStream(stream);
        if (state.stream === stream) state.stream = null;
        throw new Error("The camera opened but could not start its preview.");
      }
      console.warn("Video play was interrupted:", error);
    }

    if (previous && previous !== stream) {
      stopStream(previous);
    }

    await waitForVideoReady();

    if (generation !== state.streamGeneration) {
      stopStream(stream);
      if (state.stream === stream) state.stream = null;
      throw new Error("Camera changed while starting.");
    }

    updateCapabilities();
    setCameraUI(true);
    applyFilterPreview();
    await listCameras();

    return stream;
  }

  function waitForVideoReady() {
    if (el.video.readyState >= 2 &&
        el.video.videoWidth > 0 && el.video.videoHeight > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let finished = false;

      const cleanup = () => {
        el.video.removeEventListener("loadedmetadata", onReady);
        el.video.removeEventListener("error", onError);
        clearTimeout(timeout);
      };

      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        cleanup();
        callback(value);
      };

      const onReady = () => {
        if (el.video.videoWidth > 0) finish(resolve);
      };

      const onError = () => finish(
        reject,
        new Error("Camera preview could not be loaded.")
      );

      const timeout = setTimeout(() => {
        finish(
          reject,
          new Error("Camera preview timed out. Try restarting the camera.")
        );
      }, 12000);

      el.video.addEventListener("loadedmetadata", onReady);
      el.video.addEventListener("error", onError);

      // Close the race if metadata loaded before listeners were attached.
      onReady();
    });
  }

  async function startCamera() {
    if (state.starting) return;
    if (isStreamUsable(state.stream)) {
      setCameraUI(true);
      return;
    }

    state.starting = true;
    setLoading(true, "Requesting camera permission…");
    el.startCamera.disabled = true;

    try {
      await requestStream({ facingMode: state.facingMode });
      notify("Camera ready.");
    } catch (error) {
      console.error("Camera startup failed:", error);
      setCameraUI(false);
      setLoading(false);
      notify(readableCameraError(error), 4500);
    } finally {
      state.starting = false;
      el.startCamera.disabled = false;
    }
  }

  function readableCameraError(error) {
    const name = error && error.name ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera permission was denied. Allow camera access in browser settings.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No available camera was found on this device.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "The camera may be in use by another app. Close it and try again.";
    }
    if (name === "OverconstrainedError") {
      return "The selected camera settings are not supported. Choose Auto and retry.";
    }
    return error && error.message
      ? error.message
      : "Could not start the camera. Check permissions and try again.";
  }

  async function switchCamera(forceDeviceId = "") {
    if (state.switchPromise) return state.switchPromise;

    state.switchPromise = (async () => {
      const wasScanning = state.scannerActive;
      if (wasScanning) stopQRScanner(false);

      setLoading(true, "Switching camera…");
      el.switchCamera.disabled = true;

      const oldStream = state.stream;
      const oldFacing = state.facingMode;
      const nextFacing = oldFacing === "user" ? "environment" : "user";

      // Invalidate earlier pending camera requests before requesting another.
      state.streamGeneration++;

      try {
        let nextStream;

        try {
          nextStream = await requestStream({
            facingMode: nextFacing,
            deviceId: forceDeviceId
          });
        } catch (firstError) {
          // Fallback to a specifically enumerated camera if facingMode fails.
          await listCameras();
          const desired = forceDeviceId
            ? state.devices.find(d => d.deviceId === forceDeviceId)
            : state.devices.find(d =>
                d.deviceId &&
                (d.label.toLowerCase().includes(
                  nextFacing === "user" ? "front" : "back"
                ) ||
                 d.label.toLowerCase().includes(
                  nextFacing === "user" ? "user" : "environment"
                ))
              );

          if (!desired || desired.deviceId ===
              (oldStream && oldStream.getVideoTracks()[0] &&
               oldStream.getVideoTracks()[0].getSettings().deviceId)) {
            throw firstError;
          }

          nextStream = await requestStream({
            deviceId: desired.deviceId,
            facingMode: nextFacing
          });
        }

        state.facingMode = nextFacing;
        state.preferredDeviceId =
          state.settings.deviceId || forceDeviceId || "";

        // requestStream stops the previous stream only after new preview works.
        if (oldStream && oldStream !== nextStream) stopStream(oldStream);

        setCameraUI(true);
        if (wasScanning) await startQRScanner();
      } catch (error) {
        console.error("Camera switching failed:", error);
        setLoading(false);
        if (!isStreamUsable(state.stream)) {
          setCameraUI(false);
        }
        notify("Could not switch camera. " + readableCameraError(error), 4000);
        if (wasScanning && isStreamUsable(state.stream)) {
          await startQRScanner();
        }
      } finally {
        el.switchCamera.disabled = false;
        setLoading(false);
      }
    })();

    try {
      return await state.switchPromise;
    } finally {
      state.switchPromise = null;
    }
  }

  async function selectCameraDevice(deviceId) {
    if (!deviceId) {
      state.preferredDeviceId = "";
      notify("Automatic camera selection will be used.");
      return;
    }

    if (state.recording) {
      notify("Stop recording before changing camera.");
      updateCameraSelect();
      return;
    }

    setLoading(true, "Opening selected camera…");
    const oldFacing = state.facingMode;

    try {
      await requestStream({
        deviceId,
        facingMode: oldFacing
      });
      state.preferredDeviceId = deviceId;
      notify("Camera changed.");
    } catch (error) {
      console.error(error);
      notify(readableCameraError(error), 4000);
      updateCameraSelect();
    } finally {
      setLoading(false);
    }
  }

  function applyFilterPreview() {
    const filter = FILTERS[state.filter] || "none";
    el.video.style.filter = filter;

    // Native preview filter is a CSS preview. Canvas applies the same
    // supported CSS filter during image export.
    if (state.captureKind === "photo" && state.captureBlob) {
      renderReviewedImage();
    }
  }

  function setFilter(filter) {
    if (!(filter in FILTERS)) return;

    state.filter = filter;
    el.filterButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.filter === filter);
    });

    applyFilterPreview();

    if (state.captureKind === "photo" && state.captureBlob) {
      renderReviewedImage();
    }
  }

  function setMode(mode) {
    const supportedModes = [
      "photo", "video", "portrait", "night",
      "timelapse", "panorama", "slowmotion"
    ];

    if (!supportedModes.includes(mode)) return;
    if (state.recording && mode !== state.mode) {
      notify("Stop the current recording before changing mode.");
      return;
    }

    state.mode = mode;

    el.modeButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });

    el.shutter.classList.toggle("recording", state.recording);
    el.shutter.setAttribute(
      "aria-label",
      mode === "video" || mode === "timelapse" ||
      mode === "slowmotion" ? "Start or stop recording" : "Take photo"
    );

    // Mode changes are silent; the active button is the only normal indicator.
    if (mode === "panorama") {
      notify(
        "Panorama stitching is not implemented in this browser-only build. Use a dedicated panorama camera app.",
        4200
      );
    }
  }

  function getCaptureDimensions() {
    const sourceWidth = el.video.videoWidth || 1280;
    const sourceHeight = el.video.videoHeight || 720;
    const aspect = el.aspectSelect.value;

    if (aspect === "native") {
      return { width: sourceWidth, height: sourceHeight };
    }

    let ratio = 1;
    if (aspect === "4:3") ratio = 4 / 3;
    if (aspect === "16:9") ratio = 16 / 9;

    const sourceRatio = sourceWidth / sourceHeight;
    let width = sourceWidth;
    let height = sourceHeight;

    if (sourceRatio > ratio) {
      width = Math.round(sourceHeight * ratio);
    } else {
      height = Math.round(sourceWidth / ratio);
    }

    return {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  function getDigitalZoomCrop(width, height) {
    const native = state.capabilities.zoom;
    const nativeMax = native && Number.isFinite(native.max)
      ? native.max
      : 1;

    if (state.zoom <= nativeMax + 0.001 || !state.digitalZoom) {
      return { sx: 0, sy: 0, sw: width, sh: height };
    }

    const factor = Math.max(1, state.zoom / Math.max(1, nativeMax));
    const sw = Math.max(1, width / factor);
    const sh = Math.max(1, height / factor);

    return {
      sx: (width - sw) / 2,
      sy: (height - sh) / 2,
      sw,
      sh
    };
  }

  function drawCurrentFrame(canvas, options = {}) {
    const video = el.video;
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Camera preview is not ready.");
    }

    const dims = options.dimensions || getCaptureDimensions();
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas image processing is unavailable.");

    canvas.width = dims.width;
    canvas.height = dims.height;

    const crop = getDigitalZoomCrop(video.videoWidth, video.videoHeight);

    ctx.save();
    ctx.filter = options.filter === false
      ? "none"
      : (FILTERS[state.filter] || "none");

    if (state.mode === "portrait") {
      // This is a color treatment, not hardware depth segmentation.
      ctx.filter += " saturate(1.08) contrast(.98)";
    }

    ctx.drawImage(
      video,
      crop.sx, crop.sy, crop.sw, crop.sh,
      0, 0, canvas.width, canvas.height
    );

    if (state.mode === "night") {
      // A modest software lift; not a native computational Night Mode.
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.08 + 3);
        data[i + 1] = Math.min(255, data[i + 1] * 1.08 + 3);
        data[i + 2] = Math.min(255, data[i + 2] * 1.08 + 3);
      }
      ctx.putImageData(image, 0, 0);
    }

    ctx.restore();
  }

  function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob !== "function") {
        reject(new Error("This browser cannot export a canvas image."));
        return;
      }

      canvas.toBlob(blob => {
        if (!blob || blob.size === 0) {
          reject(new Error("The image could not be created."));
          return;
        }

        if (!blob.type.startsWith("image/")) {
          reject(new Error("The browser returned an invalid image format."));
          return;
        }

        resolve(blob);
      }, type, quality);
    });
  }

  async function capturePhoto() {
    if (state.busy) return;
    if (!isStreamUsable(state.stream)) {
      notify("Start the camera first.");
      return;
    }
    if (state.mode === "panorama") {
      notify("Panorama capture is unavailable in this version.");
      return;
    }

    state.busy = true;
    el.shutter.disabled = true;

    try {
      if (state.timerSeconds > 0) {
        await runTimer(state.timerSeconds);
        if (!isStreamUsable(state.stream)) {
          throw new Error("Camera stopped before the timer finished.");
        }
      }

      const canvas = document.createElement("canvas");
      drawCurrentFrame(canvas);

      const quality = Number(el.qualitySelect.value) || 0.92;
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);

      state.captureBlob = blob;
      state.captureKind = "photo";
      state.captureURL = URL.createObjectURL(blob);

      showPhotoReview();
      setLastCapture(blob);
      if (el.captureSoundToggle.checked) playCaptureSound();

      if (state.mode === "portrait") {
        el.reviewInfo.textContent =
          "Portrait-style color treatment applied. Hardware depth blur is not available.";
      } else if (state.mode === "night") {
        el.reviewInfo.textContent =
          "Software brightness enhancement applied. This is not a native Night Mode pipeline.";
      } else {
        el.reviewInfo.textContent =
          `Photo ready · ${Math.round(blob.size / 1024)} KB · ${FILTER_LABELS[state.filter]}`;
      }
    } catch (error) {
      console.error("Photo capture failed:", error);
      notify(error.message || "Could not capture photo.", 4000);
    } finally {
      state.busy = false;
      el.shutter.disabled = !isStreamUsable(state.stream);
    }
  }

  function showPhotoReview() {
    el.review.hidden = false;
    el.reviewImage.hidden = false;
    el.reviewVideo.hidden = true;
    el.reviewVideo.pause();
    el.reviewVideo.removeAttribute("src");
    el.reviewImage.src = state.captureURL;
    renderReviewedImage();
    el.saveCapture.disabled = false;
    el.shareCapture.disabled = false;
  }

  function renderReviewedImage() {
    if (state.captureKind !== "photo" || !state.captureBlob) return;

    // The review image uses CSS for instant preview. The exported file is
    // regenerated from the original captured image when Save is requested.
    el.reviewImage.style.filter = FILTERS[state.filter] || "none";

    if (state.mode === "portrait") {
      el.reviewInfo.textContent =
        "Portrait-style color effect · no hardware depth data";
    } else if (state.mode === "night") {
      el.reviewInfo.textContent =
        "Software low-light enhancement";
    } else {
      el.reviewInfo.textContent =
        `Photo · ${FILTER_LABELS[state.filter]}`;
    }
  }

  function closeReview() {
    el.review.hidden = true;
    el.reviewImage.style.filter = "none";
    el.reviewVideo.pause();
    el.reviewVideo.removeAttribute("src");
    el.reviewVideo.load();

    if (state.captureURL) {
      URL.revokeObjectURL(state.captureURL);
      state.captureURL = "";
    }

    state.captureBlob = null;
    state.captureKind = "";
    el.shutter.disabled = !isStreamUsable(state.stream);
  }

  async function getFilteredPhotoBlob() {
    if (!state.captureBlob || state.captureKind !== "photo") {
      throw new Error("No photo is available to save.");
    }

    const filter = state.filter;
    const canvas = document.createElement("canvas");
    const image = new Image();
    const sourceURL = URL.createObjectURL(state.captureBlob);

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not process the photo."));
        image.src = sourceURL;
      });

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas processing is unavailable.");

      ctx.filter = FILTERS[filter] || "none";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      if (state.mode === "night") {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.08 + 3);
          data[i + 1] = Math.min(255, data[i + 1] * 1.08 + 3);
          data[i + 2] = Math.min(255, data[i + 2] * 1.08 + 3);
        }

        ctx.putImageData(imageData, 0, 0);
      }

      return await canvasToBlob(
        canvas,
        "image/jpeg",
        Number(el.qualitySelect.value) || 0.92
      );
    } finally {
      URL.revokeObjectURL(sourceURL);
    }
  }

  function timestampName(prefix, extension) {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join("");

    return `NEXORA_${prefix}_${stamp}.${extension}`;
  }

  async function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("There is no valid file to save.");
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);

    try {
      anchor.click();
      // Allow the browser to begin handling the download before revoking.
      await new Promise(resolve => setTimeout(resolve, 1200));
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function saveCapture() {
    if (state.busy) return;
    if (!state.captureBlob) {
      notify("There is no capture to save.");
      return;
    }

    state.busy = true;
    el.saveCapture.disabled = true;

    try {
      let blob;
      let filename;

      if (state.captureKind === "photo") {
        blob = await getFilteredPhotoBlob();
        filename = timestampName("PHOTO", "jpg");
      } else {
        blob = state.captureBlob;
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        filename = timestampName("VIDEO", ext);
      }

      if (!blob || !blob.size) {
        throw new Error("The file could not be created.");
      }

      await downloadBlob(blob, filename);
      notify(
        "Download started. Check your Downloads folder; move the file to Gallery/Photos if needed.",
        5000
      );
    } catch (error) {
      console.error("Save failed:", error);
      notify(error.message || "Could not save this capture.", 4000);
    } finally {
      state.busy = false;
      el.saveCapture.disabled = false;
    }
  }

  async function shareCapture() {
    if (!state.captureBlob) {
      notify("There is no capture to share.");
      return;
    }

    try {
      let blob = state.captureBlob;
      let filename;

      if (state.captureKind === "photo") {
        blob = await getFilteredPhotoBlob();
        filename = timestampName("PHOTO", "jpg");
      } else {
        filename = timestampName(
          "VIDEO",
          blob.type.includes("mp4") ? "mp4" : "webm"
        );
      }

      const file = new File([blob], filename, {
        type: blob.type || "application/octet-stream"
      });

      if (navigator.canShare && navigator.canShare({ files: [file] }) &&
          navigator.share) {
        await navigator.share({
          title: "NEXORA CAMERA X",
          files: [file]
        });
        notify("Share sheet opened.");
      } else if (navigator.share) {
        await navigator.share({
          title: "NEXORA CAMERA X capture",
          text: "Captured with NEXORA CAMERA X."
        });
        notify("Share options opened. File sharing may not be supported.");
      } else {
        await downloadBlob(blob, filename);
        notify("File sharing is unavailable here. Download started instead.");
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.error("Share failed:", error);
      notify("Sharing failed. Try Save instead.", 3500);
    }
  }

  function setLastCapture(blob) {
    if (state.lastCaptureURL) {
      URL.revokeObjectURL(state.lastCaptureURL);
    }

    state.lastCaptureURL = URL.createObjectURL(blob);
    el.lastCaptureThumb.src = state.lastCaptureURL;
    el.lastCaptureThumb.hidden = false;
    el.galleryPlaceholder.hidden = true;
  }

  function openLastCapture() {
    if (!state.lastCaptureURL) {
      notify("No capture in this session yet.");
      return;
    }

    if (state.captureURL) URL.revokeObjectURL(state.captureURL);
    state.captureURL = state.lastCaptureURL;
    state.captureKind = "photo";

    // Keep a Blob reference only when this app session owns the capture.
    if (!state.captureBlob) {
      notify("This thumbnail is from the current session. Capture a new photo to review it.");
      return;
    }

    showPhotoReview();
  }

  function runTimer(seconds) {
    if (!seconds) return Promise.resolve();

    return new Promise((resolve, reject) => {
      let remaining = seconds;

      const step = () => {
        if (state.destroyed) {
          clearInterval(state.timerInterval);
          state.timerInterval = null;
          reject(new Error("Camera session ended."));
          return;
        }

        if (remaining <= 0) {
          clearInterval(state.timerInterval);
          state.timerInterval = null;
          el.toast.hidden = true;
          resolve();
          return;
        }

        notify(`Capture in ${remaining}…`, 1100);
        remaining--;
      };

      step();
      state.timerInterval = setInterval(step, 1000);
    });
  }

  function playCaptureSound() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = 880;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.055);
      oscillator.onended = () => context.close();
    } catch (error) {
      console.warn("Capture sound unavailable:", error);
    }
  }

  function applyNativeZoom(value) {
    const track = getVideoTrack();
    const caps = state.capabilities.zoom;

    if (!track || !caps) return false;

    const min = Number.isFinite(caps.min) ? caps.min : 1;
    const max = Number.isFinite(caps.max) ? caps.max : 1;
    const clamped = Math.max(min, Math.min(max, value));

    if (typeof track.applyConstraints !== "function") return false;

    return track.applyConstraints({ advanced: [{ zoom: clamped }] })
      .then(() => {
        state.zoom = value;
        return true;
      })
      .catch(error => {
        console.warn("Native zoom failed:", error);
        return false;
      });
  }

  async function setZoom(value) {
    if (!isStreamUsable(state.stream)) return;

    const track = getVideoTrack();
    const caps = state.capabilities.zoom;
    const nativeMax = caps && Number.isFinite(caps.max) ? caps.max : 1;
    const requested = Math.max(1, Math.min(10, Number(value) || 1));

    if (requested <= nativeMax && track && track.applyConstraints) {
      const success = await applyNativeZoom(requested);
      if (!success) {
        state.zoom = 1;
        notify("Native zoom could not be applied on this camera.");
      }
    } else {
      if (!state.digitalZoom) {
        notify("This camera does not support that zoom level.");
        return;
      }

      state.zoom = requested;
      if (requested > nativeMax) {
        notify("Digital zoom: image detail may decrease.", 1800);
      }
    }

    el.video.style.transform = "none";
    updateZoomUI();
  }

  async function toggleTorch() {
    const track = getVideoTrack();
    const caps = state.capabilities || {};

    if (!track || !caps.torch || !caps.torch.length) {
      notify("Torch is not supported by this camera/browser.");
      return;
    }

    try {
      const next = !state.torch;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      state.torch = next;
      el.toggleFlash.classList.toggle("active", next);
    } catch (error) {
      console.error("Torch change failed:", error);
      notify("Could not change torch setting.");
    }
  }

  async function setExposure(value) {
    const track = getVideoTrack();
    const caps = state.capabilities || {};
    const exposure = caps.exposureCompensation;

    state.exposure = Number(value);
    el.exposureValue.value = String(state.exposure);

    if (!track || !exposure || !track.applyConstraints) {
      notify("Exposure compensation is not supported by this camera.");
      return;
    }

    const clamped = Math.max(
      exposure.min,
      Math.min(exposure.max, state.exposure)
    );

    try {
      await track.applyConstraints({
        advanced: [{ exposureCompensation: clamped }]
      });
    } catch (error) {
      console.warn("Exposure control failed:", error);
      notify("The camera did not accept this exposure setting.");
    }
  }

  async function setFocusAtPoint(event) {
    const track = getVideoTrack();
    const caps = state.capabilities || {};

    if (!track || !track.applyConstraints) return;

    const rect = el.viewfinder.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    if (caps.pointsOfInterest) {
      try {
        await track.applyConstraints({
          advanced: [{ pointsOfInterest: [{ x, y }] }]
        });
        showFocusReticle(x, y);
      } catch (error) {
        console.warn("Tap focus unsupported:", error);
      }
      return;
    }

    if (caps.focusMode &&
        caps.focusMode.includes("single-shot")) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: "single-shot" }]
        });
        showFocusReticle(x, y);
      } catch (error) {
        console.warn("Focus control failed:", error);
      }
    }
  }

  function showFocusReticle(x, y) {
    el.focusReticle.hidden = false;
    el.focusReticle.style.left = `${x * 100}%`;
    el.focusReticle.style.top = `${y * 100}%`;

    setTimeout(() => {
      el.focusReticle.hidden = true;
    }, 900);
  }

  function setGrid(enabled) {
    state.grid = !!enabled;
    el.gridLines.hidden = !state.grid;
    el.toggleGrid.classList.toggle("active", state.grid);
  }

  function openPanel(panelName) {
    closePanel(false);

    const panel = panelName === "settings" ? el.settingsPanel
      : panelName === "tools" ? el.toolsPanel
      : panelName === "timer" ? el.timerPanel
      : null;

    if (!panel) return;

    state.currentPanel = panelName;
    el.panelBackdrop.hidden = false;
    panel.hidden = false;

    if (panelName === "settings") updateCapabilitiesText();
    if (panelName === "tools") {
      el.qrResult.hidden = !state.lastQRValue;
    }
  }

  function closePanel(hideBackdrop = true) {
    el.settingsPanel.hidden = true;
    el.toolsPanel.hidden = true;
    el.timerPanel.hidden = true;
    state.currentPanel = "";

    if (hideBackdrop) el.panelBackdrop.hidden = true;
  }

  function updateCapabilitiesText() {
    const caps = state.capabilities || {};
    const settings = state.settings || {};
    const lines = [
      `Camera: ${settings.label || "Current camera"}`,
      `Resolution: ${settings.width || "?"} × ${settings.height || "?"}`,
      `Native zoom: ${caps.zoom ? `${caps.zoom.min}×–${caps.zoom.max}×` : "Not reported"}`,
      `Torch: ${caps.torch ? "Supported" : "Not reported"}`,
      `Exposure: ${caps.exposureCompensation ? "Supported" : "Not reported"}`,
      `BarcodeDetector: ${"BarcodeDetector" in window ? "Available" : "Unavailable"}`,
      `MediaRecorder: ${"MediaRecorder" in window ? "Available" : "Unavailable"}`,
      `Secure context: ${window.isSecureContext ? "Yes" : "No"}`
    ];

    el.capabilityInfo.textContent = lines.join("\n");
    el.capabilityInfo.hidden = false;
  }

  function setTimer(seconds) {
    state.timerSeconds = Math.max(0, Number(seconds) || 0);
    el.timerSelect.value = String(state.timerSeconds);

    el.timerOptions.forEach(button => {
      button.classList.toggle(
        "active",
        Number(button.dataset.seconds) === state.timerSeconds
      );
    });

    closePanel();
  }

  function chooseSupportedMimeType() {
    if (!window.MediaRecorder ||
        typeof MediaRecorder.isTypeSupported !== "function") {
      return "";
    }

    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4"
    ];

    return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function startVideoRecording() {
    if (state.busy || state.recording) return;
    if (!isStreamUsable(state.stream)) {
      notify("Start the camera first.");
      return;
    }

    if (!window.MediaRecorder) {
      notify("Video recording is not supported by this browser.");
      return;
    }

    const mimeType = chooseSupportedMimeType();
    let recorder;

    try {
      recorder = mimeType
        ? new MediaRecorder(state.stream, { mimeType })
        : new MediaRecorder(state.stream);
    } catch (error) {
      console.error("MediaRecorder creation failed:", error);
      notify("Could not start video recording on this device.");
      return;
    }

    state.recordingChunks = [];
    state.mediaRecorder = recorder;
    state.recording = true;
    state.recordingStartedAt = Date.now();
    el.shutter.classList.add("recording");
    el.recordingStatus.hidden = false;
    el.shutter.setAttribute("aria-label", "Stop recording");
    el.modeButtons.forEach(button => {
      button.disabled = button.dataset.mode !== state.mode;
    });

    recorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size > 0) {
        state.recordingChunks.push(event.data);
      }
    });

    recorder.addEventListener("error", event => {
      console.error("Recording error:", event.error || event);
      notify("Video recording encountered an error.");
    });

    recorder.addEventListener("stop", () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(state.recordingChunks, { type });

      state.recording = false;
      state.mediaRecorder = null;
      state.recordingChunks = [];

      clearInterval(state.recordingInterval);
      state.recordingInterval = null;
      el.recordingStatus.hidden = true;
      el.shutter.classList.remove("recording");
      el.shutter.setAttribute("aria-label", "Take photo");
      el.modeButtons.forEach(button => button.disabled = false);

      if (!blob.size) {
        notify("Recording produced an empty file.");
        return;
      }

      state.captureBlob = blob;
      state.captureKind = "video";

      if (state.captureURL) URL.revokeObjectURL(state.captureURL);
      state.captureURL = URL.createObjectURL(blob);

      showVideoReview();
      setLastCapture(blob);
      notify("Video ready. Save it to download the recording.", 3500);
    });

    try {
      recorder.start(1000);
      state.recordingInterval = setInterval(updateRecordingTime, 500);
      updateRecordingTime();
    } catch (error) {
      state.recording = false;
      state.mediaRecorder = null;
      el.recordingStatus.hidden = true;
      el.shutter.classList.remove("recording");
      el.modeButtons.forEach(button => button.disabled = false);
      console.error(error);
      notify("Could not start recording.");
    }
  }

  function updateRecordingTime() {
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - state.recordingStartedAt) / 1000)
    );

    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    el.recordingTime.textContent = `${minutes}:${seconds}`;
  }

  function stopVideoRecording() {
    const recorder = state.mediaRecorder;
    if (!recorder || recorder.state === "inactive") return;

    try {
      recorder.stop();
    } catch (error) {
      console.error("Could not stop recording:", error);
      notify("Could not stop recording cleanly.");
    }
  }

  function showVideoReview() {
    el.review.hidden = false;
    el.reviewImage.hidden = true;
    el.reviewVideo.hidden = false;
    el.reviewVideo.src = state.captureURL;
    el.reviewVideo.load();
    el.reviewInfo.textContent =
      `Video ready · ${Math.round(state.captureBlob.size / 1024)} KB · ${state.captureBlob.type || "video"}`;
    el.saveCapture.disabled = false;
    el.shareCapture.disabled = false;
  }

  function startTimeLapse() {
    if (!isStreamUsable(state.stream)) {
      notify("Start the camera first.");
      return;
    }

    if (state.recording || state.timeLapseInterval) return;

    state.timeLapseFrames = [];
    state.timeLapseStartedAt = Date.now();
    state.timeLapseCanvas.width = 640;
    state.timeLapseCanvas.height = 480;
    state.timeLapseContext = state.timeLapseCanvas.getContext("2d");

    const sample = () => {
      if (!isStreamUsable(state.stream)) {
        stopTimeLapse();
        return;
      }

      const canvas = state.timeLapseCanvas;
      const ctx = state.timeLapseContext;
      if (!ctx) {
        stopTimeLapse();
        notify("Time-lapse canvas is unavailable.");
        return;
      }

      const sourceW = el.video.videoWidth;
      const sourceH = el.video.videoHeight;
      if (!sourceW || !sourceH) return;

      // Save compact frames at one frame per second to limit memory.
      const scale = Math.min(1, 640 / sourceW);
      canvas.width = Math.max(1, Math.round(sourceW * scale));
      canvas.height = Math.max(1, Math.round(sourceH * scale));
      ctx.filter = FILTERS[state.filter] || "none";
      ctx.drawImage(el.video, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      state.timeLapseFrames.push({
        time: Date.now(),
        imageData: frame
      });

      // Cap the frame collection to a reasonable memory budget.
      if (state.timeLapseFrames.length > 120) {
        state.timeLapseFrames.shift();
      }
    };

    sample();
    state.timeLapseInterval = setInterval(sample, 1000);
    state.recording = true;
    el.recordingStatus.hidden = false;
    el.shutter.classList.add("recording");
    el.shutter.setAttribute("aria-label", "Stop time-lapse");

    state.recordingStartedAt = Date.now();
    state.recordingInterval = setInterval(updateRecordingTime, 500);

    notify("Time-lapse recording started. Tap the shutter to finish.", 2500);
  }

  async function stopTimeLapse() {
    if (!state.timeLapseInterval) return;

    clearInterval(state.timeLapseInterval);
    state.timeLapseInterval = null;
    state.recording = false;
    clearInterval(state.recordingInterval);
    state.recordingInterval = null;
    el.recordingStatus.hidden = true;
    el.shutter.classList.remove("recording");
    el.shutter.setAttribute("aria-label", "Take photo");

    const frames = state.timeLapseFrames.slice();
    state.timeLapseFrames = [];

    if (frames.length < 2) {
      notify("Record for at least two seconds to create a time-lapse.");
      return;
    }

    // Encode sampled frames as a real playable WebM by painting to a canvas
    // and recording its captureStream. Support varies by browser.
    if (!state.timeLapseCanvas.captureStream || !window.MediaRecorder) {
      notify("This browser cannot encode the sampled time-lapse as video.");
      return;
    }

    const canvas = state.timeLapseCanvas;
    const ctx = state.timeLapseContext;
    const stream = canvas.captureStream(2);
    const mimeType = chooseSupportedMimeType();

    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (error) {
      stopStream(stream);
      notify("Time-lapse video encoding is unavailable.");
      return;
    }

    const chunks = [];
    recorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size) chunks.push(event.data);
    });

    const finished = new Promise(resolve => {
      recorder.addEventListener("stop", () => {
        stopStream(stream);
        resolve();
      }, { once: true });
    });

    try {
      recorder.start();
      for (const frame of frames) {
        ctx.putImageData(frame.imageData, 0, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      recorder.stop();
      await finished;

      const blob = new Blob(chunks, {
        type: recorder.mimeType || mimeType || "video/webm"
      });

      if (!blob.size) throw new Error("Time-lapse output was empty.");

      state.captureBlob = blob;
      state.captureKind = "video";

      if (state.captureURL) URL.revokeObjectURL(state.captureURL);
      state.captureURL = URL.createObjectURL(blob);
      showVideoReview();
      notify("Time-lapse video created.");
    } catch (error) {
      if (recorder.state !== "inactive") recorder.stop();
      stopStream(stream);
      console.error(error);
      notify("Could not encode time-lapse video.");
    }
  }

  async function handleShutter() {
    if (state.busy) return;

    if (state.mode === "video") {
      state.recording ? stopVideoRecording() : startVideoRecording();
      return;
    }

    if (state.mode === "timelapse") {
      state.timeLapseInterval ? stopTimeLapse() : startTimeLapse();
      return;
    }

    if (state.mode === "slowmotion") {
      if (!state.recording) {
        const track = getVideoTrack();
        const caps = state.capabilities || {};
        const frameRates = caps.frameRate;
        if (frameRates && frameRates.max >= 60) {
          notify("This browser cannot reliably request high-frame-rate capture from the current stream. Recording standard video instead.");
        } else {
          notify("High-frame-rate capture is not reported. Recording normal video; playback slow-down is not included.");
        }
        startVideoRecording();
      } else {
        stopVideoRecording();
      }
      return;
    }

    if (state.mode === "panorama") {
      notify("Panorama stitching is unsupported in this build.");
      return;
    }

    await capturePhoto();
  }

  async function startQRScanner() {
    if (!isStreamUsable(state.stream)) {
      await startCamera();
    }

    if (!isStreamUsable(state.stream)) return;

    if (!("BarcodeDetector" in window)) {
      notify(
        "QR decoding is not supported by this Chrome version. Update Chrome or use a QR-scanner app.",
        4500
      );
      return;
    }

    try {
      state.barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch (error) {
      console.error("BarcodeDetector initialization failed:", error);
      notify("QR scanning is unavailable in this browser.");
      return;
    }

    state.scannerActive = true;
    state.lastQRValue = "";
    el.scannerFrame.hidden = false;
    el.qrResult.hidden = true;

    closePanel(false);
    el.panelBackdrop.hidden = false;
    el.toolsPanel.hidden = false;
    state.currentPanel = "tools";

    scanQRFrame();
  }

  async function scanQRFrame() {
    if (!state.scannerActive || state.destroyed) return;

    if (!isStreamUsable(state.stream)) {
      stopQRScanner();
      return;
    }

    try {
      const results = await state.barcodeDetector.detect(el.video);
      if (results && results.length) {
        const value = results[0].rawValue || "";
        if (value && value !== state.lastQRValue) {
          state.lastQRValue = value;
          el.qrResultText.textContent = value;
          el.qrResult.hidden = false;
          el.openQRLink.hidden = !isWebURL(value);
          notify("QR code detected.", 2000);
        }
      }
    } catch (error) {
      // Some frames can fail during camera transitions; keep scanning.
      console.warn("QR frame scan failed:", error);
    }

    if (state.scannerActive) {
      state.scannerFrameId = requestAnimationFrame(scanQRFrame);
    }
  }

  function stopQRScanner(closeTools = true) {
    state.scannerActive = false;
    if (state.scannerFrameId) {
      cancelAnimationFrame(state.scannerFrameId);
      state.scannerFrameId = 0;
    }

    el.scannerFrame.hidden = true;
    state.barcodeDetector = null;

    if (closeTools && state.currentPanel === "tools") {
      closePanel();
    }
  }

  function isWebURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch (_) {
      return false;
    }
  }

  async function copyQRResult() {
    if (!state.lastQRValue) {
      notify("No QR result to copy.");
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(state.lastQRValue);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = state.lastQRValue;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();

        if (!copied) throw new Error("Clipboard permission unavailable.");
      }

      notify("QR result copied.");
    } catch (error) {
      console.error(error);
      notify("Could not copy the result. Select and copy it manually.");
    }
  }

  function reviewQRLink() {
    if (!state.lastQRValue || !isWebURL(state.lastQRValue)) return;

    let url;
    try {
      url = new URL(state.lastQRValue);
    } catch (_) {
      return;
    }

    const confirmed = window.confirm(
      `Open this link?\n\n${url.href}\n\nOnly continue if you trust the destination.`
    );

    if (confirmed) {
      window.open(url.href, "_blank", "noopener,noreferrer");
    }
  }

  function stopAllMedia() {
    state.destroyed = true;
    state.streamGeneration++;

    if (state.recording && state.mediaRecorder) {
      try {
        state.mediaRecorder.stop();
      } catch (_) {}
    }

    if (state.timeLapseInterval) {
      clearInterval(state.timeLapseInterval);
      state.timeLapseInterval = null;
    }

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    if (state.recordingInterval) {
      clearInterval(state.recordingInterval);
      state.recordingInterval = null;
    }

    stopQRScanner(false);
    stopStream(state.stream);
    state.stream = null;

    el.video.srcObject = null;

    if (state.captureURL) {
      URL.revokeObjectURL(state.captureURL);
      state.captureURL = "";
    }

    if (state.lastCaptureURL) {
      URL.revokeObjectURL(state.lastCaptureURL);
      state.lastCaptureURL = "";
    }
  }

  // Camera startup and device switching.
  el.startCamera.addEventListener("click", startCamera);
  el.switchCamera.addEventListener("click", () => {
    if (state.recording) {
      notify("Stop recording before switching cameras.");
      return;
    }
    switchCamera();
  });

  el.cameraSelect.addEventListener("change", () => {
    selectCameraDevice(el.cameraSelect.value);
  });

  // Modes change silently. Active styling is the only routine mode feedback.
  el.modeButtons.forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  el.shutter.addEventListener("click", handleShutter);
  el.stopRecording.addEventListener("click", () => {
    if (state.mode === "timelapse") stopTimeLapse();
    else stopVideoRecording();
  });

  // Filters.
  el.openFilters.addEventListener("click", () => {
    el.filterTray.hidden = !el.filterTray.hidden;
  });

  el.closeFilters.addEventListener("click", () => {
    el.filterTray.hidden = true;
  });

  el.filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter);
    });
  });

  el.reviewFilter.addEventListener("click", () => {
    el.filterTray.hidden = false;
  });

  // Zoom.
  el.zoomChips.forEach(button => {
    button.addEventListener("click", () => {
      setZoom(Number(button.dataset.zoom));
    });
  });

  // Grid, torch, exposure and tap focus.
  el.toggleGrid.addEventListener("click", () => setGrid(!state.grid));
  el.toolGrid.addEventListener("click", () => {
    setGrid(!state.grid);
    closePanel();
  });

  el.toggleFlash.addEventListener("click", toggleTorch);

  el.exposureSlider.addEventListener("change", () => {
    setExposure(el.exposureSlider.value);
  });

  el.viewfinder.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (el.review.contains(event.target)) return;
    setFocusAtPoint(event);
  });

  // Panels.
  el.openSettings.addEventListener("click", () => openPanel("settings"));
  el.openTools.addEventListener("click", () => openPanel("tools"));
  el.openTimer.addEventListener("click", () => openPanel("timer"));

  el.closePanelButtons.forEach(button => {
    button.addEventListener("click", () => closePanel());
  });

  el.panelBackdrop.addEventListener("click", event => {
    if (event.target === el.panelBackdrop) closePanel();
  });

  el.toolFilters.addEventListener("click", () => {
    closePanel();
    el.filterTray.hidden = false;
  });

  el.toolTimer.addEventListener("click", () => openPanel("timer"));

  el.toolSwitch.addEventListener("click", () => {
    closePanel();
    if (!state.recording) switchCamera();
    else notify("Stop recording before switching cameras.");
  });

  el.toolQR.addEventListener("click", startQRScanner);
  el.toolInfo.addEventListener("click", updateCapabilitiesText);

  el.copyQR.addEventListener("click", copyQRResult);
  el.openQRLink.addEventListener("click", reviewQRLink);
  el.closeQRResult.addEventListener("click", () => {
    el.qrResult.hidden = true;
    stopQRScanner();
  });

  el.timerOptions.forEach(button => {
    button.addEventListener("click", () => {
      setTimer(Number(button.dataset.seconds));
    });
  });

  el.timerSelect.addEventListener("change", () => {
    setTimer(Number(el.timerSelect.value));
  });

  el.resolutionSelect.addEventListener("change", async () => {
    if (state.recording) {
      notify("Stop recording before changing resolution.");
      return;
    }

    if (!isStreamUsable(state.stream)) return;

    const old = state.stream;
    const facing = state.facingMode;
    setLoading(true, "Applying resolution…");

    try {
      await requestStream({
        facingMode: facing,
        deviceId: state.preferredDeviceId
      });
      if (old && old !== state.stream) stopStream(old);
    } catch (error) {
      console.error(error);
      notify("Could not change resolution. Keeping the current camera.");
    } finally {
      setLoading(false);
    }
  });

  el.digitalZoomToggle.addEventListener("change", () => {
    state.digitalZoom = el.digitalZoomToggle.checked;
    updateZoomUI();

    if (!state.digitalZoom && state.zoom > 1) {
      state.zoom = 1;
      setZoom(1);
    }
  });

  el.retakePhoto.addEventListener("click", () => {
    closeReview();
  });

  el.saveCapture.addEventListener("click", saveCapture);
  el.shareCapture.addEventListener("click", shareCapture);

  el.lastCaptureThumb.addEventListener("click", openLastCapture);
  $("openLastCapture").addEventListener("click", openLastCapture);

  // The native stream is not restarted for ordinary filter, grid or menu use.
  if (navigator.mediaDevices &&
      navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", listCameras);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.scannerActive) stopQRScanner();
      // Keep the stream during a temporary visibility change; browser policy
      // may pause it. Do not silently reopen the camera in the background.
    }
  });

  window.addEventListener("pagehide", stopAllMedia, { once: true });

  if (window.isSecureContext) {
    el.secureContextLabel.textContent = "Secure camera access";
  } else {
    el.secureContextLabel.textContent = "HTTPS or localhost required";
  }

  setCameraUI(false);
  setLoading(false);
  setMode("photo");
  setFilter("natural");
  setGrid(false);
  setTimer(0);

  if (!window.isSecureContext) {
    notify(
      "Camera access generally requires HTTPS or localhost. Open this page through a secure origin.",
      5000
    );
  }

  listCameras();
});