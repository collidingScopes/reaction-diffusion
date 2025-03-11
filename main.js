// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimization 1: Disable alpha for better performance

let cols;
let rows;
let resolution = 3;

// Set canvas size
const size = Math.min(window.innerWidth - 40, 800);
canvas.width = size;
canvas.height = size;

// For color smoothing
let previousImageData = null;
let imageDataBuffer = null; // Optimization 2: Reuse imageData buffer

let aColorRGB = [0, 0, 0];
let bColorRGB = [0, 0, 255];

// Grid resolution
resolution = 3;
cols = Math.floor(canvas.width / resolution);
rows = Math.floor(canvas.height / resolution);

// Create grid with two chemicals: A and B
let grid = [];
let next = [];

// Animation state tracking
let animationId = null;
let lastRandomDrop = 0;
let lastFrameTime = 0; // Optimization 4: Track frame times for FPS management

// Presets for patterns
const presets = {
  coral: {dA: 1.50, dB: 2.00, feed: 0.031, kill: 0.048},
  wormHole: {dA: 1.56, dB: 1.55, feed: 0.048, kill: 0.041},
  eddy: {dA: 1.50, dB: 1.70, feed: 0.035, kill: 0.043},
  swirl: {dA: 1.16, dB: 2.00, feed: 0.17, kill: 0.014},
  maze: {dA: 1.53, dB: 1.8, feed: 0.083, kill: 0.186},
};

// Parameters for the reaction-diffusion simulation
let gui;
const params = {
    preset: 'coral',
    resolution: 3,
    dA: 1.54,                // Diffusion rate for chemical A
    dB: 1.99,                // Diffusion rate for chemical B
    feed: 0.031,             // Feed rate
    kill: 0.048,             // Kill rate
    timeStep: 0.7,           // Added a time step parameter (reduced from 0.8 to 0.2)
    paused: false,           // Animation state
    
    // Visualization mode
    visualizationMode: 'blend', // 'a', 'b', or 'blend'
    
    // Color controls for chemicals A and B
    aColorHex: "#000000",    // chemical A (default)
    bColorHex: "#0000ff",    // chemical B (default)
    
    dropSize: 5,             // Size of drops when clicking
    randomDrops: false,      // Enable random drops
    dropInterval: 1000,      // Milliseconds between random drops
    colorSmoothing: 0.2,     // Color smoothing factor
    colorThreshold: 0.2,

    // Add drop button (handled separately)
    addDrop: function() {
        const x = Math.random() * cols;
        const y = Math.random() * rows;
        const radius = 5 + Math.random() * 10;
        addDropPattern(x, y, radius);
    }
};

// Setup dat.GUI controls
function setupControls() {
    gui = new dat.GUI({ autoPlace: true, width: 300 });
    
    // Create folders for organization
    const presetsFolder = gui.addFolder('Preset Patterns');
    const generalFolder = gui.addFolder('Simulation Controls');
    const patternFolder = gui.addFolder('Pattern Parameters');
    const visualFolder = gui.addFolder('Visualization Controls');
    const colorFolder = gui.addFolder('Color Controls');
    const dropFolder = gui.addFolder('Drop Controls');
    
    // Optimization 24: Add FPS display
    const fpsDiv = document.createElement('div');
    fpsDiv.style.position = 'absolute';
    fpsDiv.style.top = '5px';
    fpsDiv.style.left = '5px';
    fpsDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
    fpsDiv.style.color = 'white';
    fpsDiv.style.padding = '5px';
    document.body.appendChild(fpsDiv);
    
    let frameCount = 0;
    let lastFpsUpdate = 0;
    let currentFps = 0;
    
    // Update FPS counter
    function updateFPS(timestamp) {
        frameCount++;
        
        if (timestamp - lastFpsUpdate > 1000) {
            currentFps = Math.round(frameCount * 1000 / (timestamp - lastFpsUpdate));
            fpsDiv.textContent = `FPS: ${currentFps}`;
            frameCount = 0;
            lastFpsUpdate = timestamp;
        }
        
        requestAnimationFrame(updateFPS);
    }
    requestAnimationFrame(updateFPS);

    // Presets dropdown
    const presetOptions = Object.keys(presets);
    presetsFolder.add(params, 'preset', presetOptions).name('Pattern Presets')
        .onChange((value) => {
            if (presets[value]) {
                const preset = presets[value];
                params.dA = preset.dA;
                params.dB = preset.dB;
                params.feed = preset.feed;
                params.kill = preset.kill;

                // Update the GUI controllers
                for (let i = 0; i < gui.__controllers.length; i++) {
                    gui.__controllers[i].updateDisplay();
                }
                
                // Reset the simulation
                initGrid();
            }
        });
    presetsFolder.open();
    
    // Pattern Parameters
    patternFolder.add(params, 'dA', 0.1, 10.0).name('Diffusion A').step(0.01);
    patternFolder.add(params, 'dB', 0.1, 10.0).name('Diffusion B').step(0.01);
    
    patternFolder.add(params, 'feed', 0.001, 0.4).name('Feed Rate (F)').step(0.001);
    patternFolder.add(params, 'kill', 0.001, 0.4).name('Kill Rate (k)').step(0.001);

    generalFolder.add(params, 'timeStep', 0.01, 1.0).name('Animation Speed').step(0.01);

    // Optimization 25: Handle resolution changes correctly
    patternFolder.add(params, 'resolution', 1, 10).name('Resolution').step(1)
        .onChange(() => {
            initGrid();
        });

    patternFolder.open();

    // Visualization Controls
    visualFolder.add(params, 'visualizationMode', ['a', 'b', 'blend', 'subtract']).name('View Mode');
    visualFolder.add(params, 'colorSmoothing', 0, 0.95).name('Temporal Smoothing').step(0.05);
    visualFolder.add(params, 'colorThreshold', 0, 0.8).name('Color Threshold').step(0.01);
    visualFolder.open();
    
    // Color Controls - single color picker for each chemical
    addColorPicker(colorFolder, 'aColorHex', 'Chemical A Color');
    addColorPicker(colorFolder, 'bColorHex', 'Chemical B Color');
    
    // Drop Controls
    dropFolder.add(params, 'dropSize', 1, 30).name('Drop Size').step(1);
    dropFolder.add(params, 'randomDrops').name('Random Drops');
    dropFolder.add(params, 'dropInterval', 100, 5000).name('Drop Interval (ms)').step(100);
    
    // Simulation Controls
    generalFolder.add(params, 'paused').name('Pause Simulation');
    generalFolder.open();
    
    // Set up the Add Drop button event handler
    document.getElementById('addDropBtn').addEventListener('click', () => {
        params.addDrop();
    });
    
    // Add click event to canvas for adding drops
    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / resolution;
        const y = (event.clientY - rect.top) / resolution;
        addDropPattern(x, y);
    });

    // Event listeners for keyboard shortcuts
    document.addEventListener('keydown', function(event) {
      if (event.key === 's') {
        saveImage();
      } else if (event.key === 'v') {
        toggleVideoRecord();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePlayPause();
      } else if(event.key === 'Enter'){
        restartAnimation();
      } else if(event.key === 'r'){
        randomizeInputs();
      } else if(event.key === 'u'){
        imageInput.click();
      } else if(event.key === 'c'){
        chooseRandomPalette();
      }
    });

    return gui;
}

// Initialize the grid
function initGrid() {
    resolution = params.resolution;
    cols = Math.floor(canvas.width / resolution);
    rows = Math.floor(canvas.height / resolution);

    // Optimization 5: Preallocate arrays with correct size
    grid = new Array(cols);
    next = new Array(cols);
    
    for (let i = 0; i < cols; i++) {
        grid[i] = new Array(rows);
        next[i] = new Array(rows);
        for (let j = 0; j < rows; j++) {
            grid[i][j] = { a: 1, b: 0 };
            next[i][j] = { a: 1, b: 0 };
        }
    }
    
    // Add a seed pattern in the center
    addDropPattern(cols/2, rows/2, 10);
    
    // Optimization 6: Reset image data buffer
    imageDataBuffer = new ImageData(canvas.width, canvas.height);
    previousImageData = null;
}

// Add a drop pattern at a specific location
function addDropPattern(x, y, radius) {
    const centerX = Math.floor(x);
    const centerY = Math.floor(y);
    
    // Use dropSize from params if radius not specified
    const dropRadius = radius || params.dropSize;
    const radiusSquared = dropRadius * dropRadius; // Optimization 7: Use squared distance for faster comparison
    
    // Optimization 8: Only loop through cells that might be affected
    const startI = Math.max(0, centerX - dropRadius - 1);
    const endI = Math.min(cols - 1, centerX + dropRadius + 1);
    const startJ = Math.max(0, centerY - dropRadius - 1);
    const endJ = Math.min(rows - 1, centerY + dropRadius + 1);
    
    for (let i = startI; i <= endI; i++) {
        for (let j = startJ; j <= endJ; j++) {
            // Calculate squared distance from center
            const distanceSquared = Math.pow(i - centerX, 2) + Math.pow(j - centerY, 2);
            
            // If within radius, add chemical B
            if (distanceSquared < radiusSquared) {
                grid[i][j].b = 1;
            }
        }
    }
}

// Optimization 9: Cache hex to RGB conversion
function updateColorCache() {
    aColorRGB = hexToRgb(params.aColorHex);
    bColorRGB = hexToRgb(params.bColorHex);
}

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace(/^#/, '');
    
    // Parse hex values
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    
    return [r, g, b];
}

// Convert values for chemicals A and B to color based on visualization mode
// Optimization 10: Simplified color conversion
function valuesToColor(a, b, outObj) {
    // Apply gamma correction for smoother gradients
    const aValue = Math.pow(a, 0.3);
    const bValue = Math.pow(b, 0.3);
    
    if(aValue <= params.colorThreshold || bValue <= params.colorThreshold || aValue == 1 || bValue == 1){
        outObj.r = aColorRGB[0];
        outObj.g = aColorRGB[1];
        outObj.b = aColorRGB[2];
        return;
    }

    // Otherwise proceed with normal visualization based on mode
    switch (params.visualizationMode) {
        case 'a':
            // Only show chemical A
            outObj.r = Math.min(255, Math.floor(aValue * aColorRGB[0]));
            outObj.g = Math.min(255, Math.floor(aValue * aColorRGB[1]));
            outObj.b = Math.min(255, Math.floor(aValue * aColorRGB[2]));
            break;
            
        case 'b':
            // Only show chemical B
            outObj.r = Math.min(255, Math.floor(bValue * bColorRGB[0]));
            outObj.g = Math.min(255, Math.floor(bValue * bColorRGB[1]));
            outObj.b = Math.min(255, Math.floor(bValue * bColorRGB[2]));
            break;
            
        case 'blend':
        default:
            // Blend both chemicals
            outObj.r = Math.min(255, Math.floor(aValue * aColorRGB[0] + bValue * bColorRGB[0] * 1.0));
            outObj.g = Math.min(255, Math.floor(aValue * aColorRGB[1] + bValue * bColorRGB[1] * 1.0));
            outObj.b = Math.min(255, Math.floor(aValue * aColorRGB[2] + bValue * bColorRGB[2]));
            break;
            
        case 'subtract':
            // Subtraction blend - shows where B is consuming A
            outObj.r = Math.min(255, Math.floor(aValue * aColorRGB[0] * (1 - bValue * 0.8)));
            outObj.g = Math.min(255, Math.floor(aValue * aColorRGB[1] * (1 - bValue * 0.8)));
            outObj.b = Math.min(255, Math.floor(bValue * bColorRGB[2]));
            break;
    }
}

// Optimization 11: Precompute laplacian weights
const CENTER_WEIGHT = -1;
const CARDINAL_WEIGHT = 0.2;
const DIAGONAL_WEIGHT = 0.05;

// Optimization 12: Precompute indices for 9-point stencil
const STENCIL = [
    { di: -1, dj: -1, weight: DIAGONAL_WEIGHT },
    { di: 0, dj: -1, weight: CARDINAL_WEIGHT },
    { di: 1, dj: -1, weight: DIAGONAL_WEIGHT },
    { di: -1, dj: 0, weight: CARDINAL_WEIGHT },
    { di: 0, dj: 0, weight: CENTER_WEIGHT },
    { di: 1, dj: 0, weight: CARDINAL_WEIGHT },
    { di: -1, dj: 1, weight: DIAGONAL_WEIGHT },
    { di: 0, dj: 1, weight: CARDINAL_WEIGHT },
    { di: 1, dj: 1, weight: DIAGONAL_WEIGHT }
];

// Compute one step of the simulation
function computeStep() {
    // Optimization 13: Use constants for frequent calculations
    const FEED = params.feed;
    const KILL = params.kill;
    const DA = params.dA;
    const DB = params.dB;
    const DT = params.timeStep;
    
    // For each cell
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let a = grid[i][j].a;
            let b = grid[i][j].b;
            
            // Calculate the Laplacian (approximation of 2nd derivative)
            let laplaceA = 0;
            let laplaceB = 0;
            
            for (const point of STENCIL) {
                const ni = (i + point.di + cols) % cols;
                const nj = (j + point.dj + rows) % rows;
                
                laplaceA += grid[ni][nj].a * (point.weight);
                laplaceB += grid[ni][nj].b * (point.weight);
            }
            
            // Gray-Scott model formula
            const reaction = a * b * b;
            
            // Update values using the model's equations with variable dt
            next[i][j].a = a + (DA*(0.8/DT) * laplaceA - reaction + FEED * (1 - a)) * DT;
            next[i][j].b = b + (DB*(0.8/DT) * laplaceB + reaction - (KILL + FEED) * b) * DT;
            
            // Constrain values to ensure stability
            next[i][j].a = Math.max(0, Math.min(1, next[i][j].a));
            next[i][j].b = Math.max(0, Math.min(1, next[i][j].b));
        }
    }
    
    // Swap grids
    [grid, next] = [next, grid];
}

// Optimization 15: Reuse color object
const colorObj = { r: 0, g: 0, b: 0 };

// Render the current state to the canvas
function render() {
    // Optimization 16: Reuse image data buffer instead of creating new one
    if (!imageDataBuffer) {
        imageDataBuffer = ctx.createImageData(canvas.width, canvas.height);
    }
    
    const data = imageDataBuffer.data;
    
    // Optimization 17: Cache resolution value
    const res = resolution;
    const width = canvas.width;
    
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            // Get the concentrations of both chemicals
            let a = grid[i][j].a;
            let b = grid[i][j].b;
            
            // Map values to RGB color using our function
            valuesToColor(a, b, colorObj);
            
            // Optimization 18: Unroll the pixel setting loop for small resolution values
            const baseX = i * res;
            const baseY = j * res;
            
            // Set pixels (each cell is resolution x resolution pixels)
            for (let x = 0; x < res; x++) {
                const xOffset = baseX + x;
                for (let y = 0; y < res; y++) {
                    const pixelIndex = 4 * ((baseY + y) * width + xOffset);
                    data[pixelIndex] = colorObj.r;     // R
                    data[pixelIndex + 1] = colorObj.g; // G
                    data[pixelIndex + 2] = colorObj.b; // B
                    data[pixelIndex + 3] = 255;        // Alpha
                }
            }
        }
    }
    
    // Apply temporal smoothing if we have a previous frame
    if (previousImageData && params.colorSmoothing > 0) {
        const prevData = previousImageData.data;
        const smoothFactor = params.colorSmoothing;
        
        // Optimization 19: Process 4 pixels at a time with a faster loop
        const dataLength = data.length;
        for (let i = 0; i < dataLength; i += 4) {
            data[i] = (data[i] * (1 - smoothFactor) + prevData[i] * smoothFactor) | 0;         // R
            data[i + 1] = (data[i + 1] * (1 - smoothFactor) + prevData[i + 1] * smoothFactor) | 0; // G
            data[i + 2] = (data[i + 2] * (1 - smoothFactor) + prevData[i + 2] * smoothFactor) | 0; // B
            // Alpha is always 255, no need to blend
        }
    }
    
    // Store a deep copy of the current frame for next time
    if (!previousImageData) {
        previousImageData = new ImageData(
            new Uint8ClampedArray(data), 
            imageDataBuffer.width, 
            imageDataBuffer.height
        );
    } else {
        // Optimization 20: Copy data without creating new ImageData
        previousImageData.data.set(data);
    }
    
    // Draw the image data to canvas
    ctx.putImageData(imageDataBuffer, 0, 0);
}

// Optimization 21: Use requestAnimationFrame with timing control
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;

// Animation loop with timing control
function animate(timestamp) {
    animationId = requestAnimationFrame(animate);
    
    // Calculate elapsed time since last frame
    const elapsed = timestamp - lastFrameTime;
    
    // Skip frames if we're running too fast
    if (elapsed < FRAME_TIME) {
        return;
    }
    
    // Update timestamp
    lastFrameTime = timestamp - (elapsed % FRAME_TIME);
    
    if (!params.paused) {
        computeStep();
        
        // Handle random drops if enabled
        if (params.randomDrops && timestamp - lastRandomDrop > params.dropInterval) {
            params.addDrop();
            lastRandomDrop = timestamp;
        }
    }
    
    render();
}

// Helper function to create a color picker
function addColorPicker(folder, paramName, label) {
    // Optimization 23: Update color cache when colors change
    folder.addColor(params, paramName).name(label).onChange(updateColorCache);
}


function togglePlayPause() {
    params.paused = !params.paused;
    // Update the GUI controller
    for (let i = 0; i < gui.__controllers.length; i++) {
        const controller = gui.__controllers[i];
        if (controller.property === 'paused') {
            controller.updateDisplay();
            break;
        }
    }
}

// Start the simulation
function init() {
    // Initialize color cache
    updateColorCache();
    
    // Initialize grid
    initGrid();
    
    // Setup GUI controls
    const gui = setupControls();
    
    // Initialize lastRandomDrop
    lastRandomDrop = performance.now();
    lastFrameTime = performance.now();
    
    // Start animation loop
    animate(performance.now());
    
    // Handle window resize - Optimization 26: Throttle resize events
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Update canvas size
            const newSize = Math.min(window.innerWidth - 40, 800);
            if (canvas.width !== newSize) {
                canvas.width = newSize;
                canvas.height = newSize;
                
                // Update grid dimensions
                const newCols = Math.floor(canvas.width / resolution);
                const newRows = Math.floor(canvas.height / resolution);
                
                // If dimensions changed, reinitialize the grid
                if (newCols !== cols || newRows !== rows) {
                    cols = newCols;
                    rows = newRows;
                    initGrid();
                }
                
                // Reset image data buffers
                imageDataBuffer = null;
                previousImageData = null;
            }
        }, 200); // 200ms throttle
    });
}

// Optimization 27: Handle visibility change to pause when tab is inactive
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Save paused state and pause if not already paused
        params.wasPaused = params.paused;
        params.paused = true;
    } else if (params.wasPaused === false) {
        // Only unpause if it wasn't paused before
        params.paused = false;
    }
});

function randomizeInputs() {
    // Implementation would go here
}

function restartAnimation() {
    // Cancel the current animation frame if it exists
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Reset the grid to initial state with current parameters
    initGrid();
    
    // Reset visualization state
    previousImageData = null;
    imageDataBuffer = new ImageData(canvas.width, canvas.height);
    
    // Reset timing variables
    lastRandomDrop = performance.now();
    lastFrameTime = performance.now();
    
    // Restart the animation loop
    animate(performance.now());
}

// Start everything
init();