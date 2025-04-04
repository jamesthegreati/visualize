// Basic Three.js setup
let scene, camera, renderer, composer, bloomPass;
// Web Audio API setup
let audioContext, analyser, source, audio;
let dataArray; // To store frequency data

const canvas = document.getElementById('visualizerCanvas');
const fileInput = document.getElementById('audioFile');
const loadingIndicator = document.getElementById('loading');

function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50; // Adjust camera position

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // For sharper rendering on high-DPI screens
    renderer.setClearColor(0x000000, 1); // Black background

    // Post-processing setup
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.0, // strength
        0.4, // radius
        0.85 // threshold
    );
    composer.addPass(bloomPass);


    // Basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(50, 50, 50);
    scene.add(pointLight);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); // Resize composer too
}

function initAudio() {
    audio = new Audio();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Power of 2, determines frequency resolution

    // Connect analyser to destination (speakers)
    analyser.connect(audioContext.destination);

    // Create buffer for frequency data
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Create audio source node from the <audio> element
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser); // Connect source to analyser

    // Handle file input change
    fileInput.addEventListener('change', handleFileSelect, false);
}

function handleFileSelect(event) {
    if (audioContext.state === 'suspended') {
        audioContext.resume(); // Ensure context is running (required by some browsers)
    }

    const files = event.target.files;
    if (files.length > 0) {
        loadingIndicator.style.display = 'block'; // Show loading indicator
        const file = files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            audio.src = e.target.result;
            audio.load(); // Important: load the new source
            audio.play().then(() => {
                loadingIndicator.style.display = 'none'; // Hide loading indicator
                console.log("Audio playing");
                // Start animation loop only after audio starts playing
                if (!renderer.info.render.frame) { // Check if animation loop is already running
                   animate();
                }
            }).catch(error => {
                console.error("Error playing audio:", error);
                loadingIndicator.style.display = 'none';
                alert("Could not play audio file. Please try a different file or format.");
            });
        };

        reader.onerror = function(e) {
            console.error("Error reading file:", e);
            loadingIndicator.style.display = 'none';
            alert("Error reading the audio file.");
        };

        reader.readAsDataURL(file); // Read file as Data URL
    }
}

// Visualization objects
let particleSystem;
const particleCount = 5000; // Number of particles
const particlesGeometry = new THREE.BufferGeometry();
const posArray = new Float32Array(particleCount * 3); // x, y, z for each particle
const initialPositions = new Float32Array(particleCount * 3); // Store original positions
const colors = new Float32Array(particleCount * 3); // r, g, b for each particle

function createVisualization() {
    const material = new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true, // Use per-particle color
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending // Brighter where particles overlap
    });

    // Create particles in a spherical distribution
    for (let i = 0; i < particleCount * 3; i += 3) {
        // Spherical coordinates
        const radius = 20 + Math.random() * 20; // Spread particles in a shell
        const phi = Math.acos(-1 + (2 * Math.random())); // Latitude
        const theta = Math.sqrt(particleCount * Math.PI) * phi; // Longitude (Golden Angle Spiral approx)

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        posArray[i] = x;
        posArray[i + 1] = y;
        posArray[i + 2] = z;

        // Store initial positions
        initialPositions[i] = x;
        initialPositions[i + 1] = y;
        initialPositions[i + 2] = z;

        // Assign colors (e.g., based on initial position or random)
        const color = new THREE.Color();
        // Color based on position (example: map y-coordinate to hue)
        color.setHSL(0.5 + 0.5 * (y / (radius * 2)), 0.8, 0.6); // Blues/Purples/Pinks
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    particleSystem = new THREE.Points(particlesGeometry, material);
    scene.add(particleSystem);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Get frequency data
    analyser.getByteFrequencyData(dataArray); // Values between 0-255

    // Update particle positions based on frequency data
    const positions = particleSystem.geometry.attributes.position.array;
    const bufferLength = analyser.frequencyBinCount; // Typically analyser.fftSize / 2

    for (let i = 0; i < particleCount; i++) {
        const index = i * 3;

        // Map particle index to frequency bin (simple mapping)
        const freqIndex = Math.floor((i / particleCount) * bufferLength);
        const frequencyValue = dataArray[freqIndex] / 255; // Normalize 0-1

        // Calculate displacement vector (from origin towards initial position)
        const initialX = initialPositions[index];
        const initialY = initialPositions[index + 1];
        const initialZ = initialPositions[index + 2];
        const initialRadius = Math.sqrt(initialX*initialX + initialY*initialY + initialZ*initialZ);

        if (initialRadius > 0) { // Avoid division by zero for particle at origin
            const displacementFactor = 1 + frequencyValue * 5; // How much particles move outwards

            // New position = initial position scaled by displacement
            positions[index] = initialX * displacementFactor;
            positions[index + 1] = initialY * displacementFactor;
            positions[index + 2] = initialZ * displacementFactor;
        }
    }

    // Flag the position attribute as needing an update
    particleSystem.geometry.attributes.position.needsUpdate = true;

    // Optional: Rotate the whole system for more dynamism
    particleSystem.rotation.y += 0.001;
    particleSystem.rotation.x += 0.0005;


    // renderer.render(scene, camera); // Render using composer instead
    composer.render();
}

// Initialize everything
initThreeJS();
initAudio();
createVisualization(); // Create initial objects

// Note: The animate() loop will start when audio is loaded and played