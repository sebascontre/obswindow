const params = new URLSearchParams(window.location.search);
const is_set = (variable) => typeof variable !== "undefined";
const is_null = (variable) => variable === null;
const is_empty = (str) => str.length === 0;
const is_OBS = is_set(window.obsstudio);
const obs_ws = is_OBS ? null : new OBSWebSocket();

const obs_ip = params.get("ip") ?? "localhost",
  obs_port = params.get("port") ?? "4455",
  obs_pass = params.get("pass") ?? "";

async function get_obs_preview() {
  let { currentProgramSceneName } = await obs_ws.call("GetCurrentProgramScene");
  let { imageData } = await obs_ws.call("GetSourceScreenshot", {
    sourceName: currentProgramSceneName,
    imageFormat: "jpg",
    imageWidth: 640,
    imageHeight: 360,
    imageCompressionQuality: 50,
  });

  document.getElementById("preview").src = imageData;
  //console.log("requesting image: " + Date.now());
  setTimeout(get_obs_preview, 250);
}

async function get_obs_width() {
  let { baseWidth } = await obs_ws.call("GetVideoSettings");
  scale = baseWidth / document.body.clientWidth;
}

function obs_send(event, data) {
  obs_ws.call("CallVendorRequest", {
    vendorName: "obs-browser",
    requestType: "emit_event",
    requestData: {
      event_name: "obs-websocket-" + event,
      event_data: { data: data },
    },
  });
}

if (is_OBS) {
  document.documentElement.classList.add("obs");

  window.addEventListener("obs-websocket-draw", function (event) {
    drawOnCanvas(event.detail.data);
  });

  window.addEventListener("obs-websocket-color", function (event) {
    context.strokeStyle = event.detail.data;
  });

  window.addEventListener("obs-websocket-undo", function (event) {
    console.log(event)
    document.getElementById("preview").src = event.detail.data;
    document.getElementById("preview").style.display = 'block';
    context.clearRect(0, 0, canvas.width, canvas.height); // Limpiar el lienzo
  });

} else {
  obs_ws.connect(`ws://${obs_ip}:${obs_port}`, obs_pass);
  obs_ws.once("ConnectionOpened", async () => {
    setTimeout(get_obs_preview, 500);
    setTimeout(get_obs_width, 500);

    //requestIdleCallback(get_obs_preview);
    //requestIdleCallback(get_obs_width);
    window.onresize = get_obs_width;
  });
}

/* DRAWING */
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });

let scale = 1;

let lineWidth = 0
let isMousedown = false
let points = []
let undoing = false;

const strokeHistory = []

const undoStack = []

const requestIdleCallback = window.requestIdleCallback || function (fn) { setTimeout(fn, 1) };

/**
 * This function takes in an array of points and draws them onto the canvas.
 * @param {array} stroke array of points to draw on the canvas
 * @return {void}
 */
function drawOnCanvas (stroke) {
  if (!is_OBS && !undoing) { obs_send("draw", stroke) }


  context.lineCap = 'round'
  context.lineJoin = 'round'

  const l = stroke.length - 1
  if (stroke.length >= 3) {
    const xc = (stroke[l].x + stroke[l - 1].x) / 2
    const yc = (stroke[l].y + stroke[l - 1].y) / 2
    context.lineWidth = stroke[l - 1].lineWidth
    context.quadraticCurveTo(stroke[l - 1].x, stroke[l - 1].y, xc, yc)
    context.stroke()
    context.beginPath()
    context.moveTo(xc, yc)
  } else {
    const point = stroke[l];
    context.lineWidth = point.lineWidth
    context.strokeStyle = point.color
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.stroke()
  }
}

/**
 * Remove the previous stroke from history and repaint the entire canvas based on history
 * @return {void}
 */
function undoDraw () {
  if (undoStack.length > 1) {
    undoStack.pop();
    context.clearRect(0, 0, canvas.width, canvas.height); // Limpiar el lienzo
    context.putImageData(undoStack[undoStack.length - 1], 0, 0);
  }
  if (!is_OBS) { obs_send("undo", canvas.toDataURL()) }
  
}

for (const ev of ["touchstart", "mousedown"]) {
  canvas.addEventListener(ev, function (e) {
    e.preventDefault()
    

    let pressure = 0.1;
    let x, y;
    if (e.touches && e.touches[0] && typeof e.touches[0]["force"] !== "undefined") {

      if (e.touches.length === 2) { undoDraw(); undoStack.pop(); return; }

      if (e.touches[0]["force"] > 0) {
        pressure = e.touches[0]["force"]
      }
      x = e.touches[0].pageX * scale
      y = e.touches[0].pageY * scale
    } else {
      pressure = 1.0
      x = e.pageX * scale
      y = e.pageY * scale
    }

    isMousedown = true

    lineWidth = Math.log(pressure + 1) * 40
    context.lineWidth = lineWidth// pressure * 50;

    points.push({ x, y, lineWidth })
    drawOnCanvas(points)
  })
}

for (const ev of ['touchmove', 'mousemove']) {
  canvas.addEventListener(ev, function (e) {
    if (!isMousedown) return
    e.preventDefault()

    let pressure = 0.1
    let x, y
    if (e.touches && e.touches[0] && typeof e.touches[0]["force"] !== "undefined") {
      if (e.touches.length === 2) { return; }

      if (e.touches[0]["force"] > 0) {
        pressure = e.touches[0]["force"]
      }
      x = e.touches[0].pageX * scale
      y = e.touches[0].pageY * scale
    } else {
      pressure = 1.0
      x = e.pageX * scale
      y = e.pageY * scale
    }

    // smoothen line width
    lineWidth = (Math.log(pressure + 1) * 40 * 0.2 + lineWidth * 0.8)
    points.push({ x, y, lineWidth })

    drawOnCanvas(points);
  })
}

for (const ev of ['touchend', 'touchleave', 'mouseup']) {
  canvas.addEventListener(ev, function (e) {
    let pressure = 0.1;
    let x, y;

    if (e.touches && e.touches[0] && typeof e.touches[0]["force"] !== "undefined") {
      if (e.touches.length === 2) { return; }

      if (e.touches[0]["force"] > 0) {
        pressure = e.touches[0]["force"]
      }
      x = e.touches[0].pageX * scale
      y = e.touches[0].pageY * scale
    } else {
      pressure = 1.0
      x = e.pageX * scale
      y = e.pageY * scale
    }

    isMousedown = false

    strokeHistory.push([...points]); points = [];
    undoStack.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (!is_OBS) { obs_send("undo", canvas.toDataURL()) }

    lineWidth = 0
  })
};



undoStack.push(context.getImageData(0, 0, canvas.width, canvas.height));

/**
 * Cambia el color del estilo de trazo del contexto.
 * Si el parámetro color es un objeto, extrae el color hexadecimal de su propiedad detail.
 * Si OBS no está habilitado, envía el color a OBS utilizando la función obs_send.
 * @param {string|object} color - El color a establecer como estilo de trazo.
 */
function changeColor(color) {
  // Verifica si el parámetro color es un objeto y extrae el color hexadecimal de su propiedad detail
  if (typeof color === "object") {
    color = color.detail._hex;
  }

  // Si OBS no está habilitado, envía el color a OBS utilizando la función obs_send
  if (!is_OBS) {
    obs_send("color", color);
  }

  // Establece el color como estilo de trazo del contexto
  context.strokeStyle = color;
}

document.getElementById("colorPicker").addEventListener("change", changeColor);