let scene, camera, renderer, controls, transformControls;
let walls = [], floor;
let objects = [];
let selectedObject = null;
let selectedWall = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let loadedTextures = {};
let gltfLoader = new THREE.GLTFLoader();
let objLoader = new THREE.OBJLoader();
let fbxLoader = new THREE.FBXLoader();
let sinkModel = null;
let mirrorModel = null;
let bidetModel = null;
let actionHistory = [];
let redoStack = [];
let selectedTexture = null;

// Variable pour gérer la rotation de la texture
let textureRotationAngle = 0;

// Pour détecter les triple-clics
let clickCount = 0;
let clickTimer;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('scene') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI;

    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    scene.add(transformControls);

    transformControls.addEventListener('dragging-changed', function(event) {
        controls.enabled = !event.value;
    });

    createWalls();
    createFloor();

    camera.position.set(0, 1.5, 5);
    camera.lookAt(0, 1, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Gestion des clics et double-clics
    renderer.domElement.addEventListener('click', onClick, false);
    renderer.domElement.addEventListener('dblclick', onDoubleClick, false);
    window.addEventListener('resize', onWindowResize, false);

    animate();

    document.getElementById('lightIntensity').addEventListener('input', function (event) {
        const intensity = parseFloat(event.target.value);
        ambientLight.intensity = intensity;
    });
}

function createWalls() {
    const wallGeometry = new THREE.PlaneGeometry(5, 3);

    for (let i = 0; i < 2; i++) {
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
        walls[i] = new THREE.Mesh(wallGeometry, wallMaterial);

        if (i === 0) {
            walls[i].position.set(0, 1.5, -2.5);
        } else {
            walls[i].position.set(-2.5, 1.5, 0);
            walls[i].rotation.y = Math.PI / 2;
        }

        scene.add(walls[i]);
        objects.push(walls[i]);  // Ajouter les murs aux objets cliquables
    }
}

function createFloor() {
    const floorGeometry = new THREE.PlaneGeometry(5, 5);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    objects.push(floor);  // Ajouter le sol aux objets cliquables
}

function applySelectedTexture() {
    if (selectedWall && selectedTexture) {
        selectedTexture.wrapS = THREE.RepeatWrapping;
        selectedTexture.wrapT = THREE.RepeatWrapping;
        selectedTexture.center.set(0.5, 0.5); // Centrer la texture pour la rotation

        // Définir l'épaisseur des joints
        let groutThickness = 0.25; // Augmenter cette valeur pour des joints plus épais

        // Ajuster les proportions pour éviter la déformation et inclure les joints
        const aspectRatio = selectedTexture.image.width / selectedTexture.image.height;
        let repeatX, repeatY;

        // Calcul des répétitions en fonction du type de surface
        if (selectedWall === floor) {
            repeatX = (5 - groutThickness) / aspectRatio;
            repeatY = 5 - groutThickness;
        } else {
            repeatX = (selectedWall.geometry.parameters.width - groutThickness) / aspectRatio;
            repeatY = selectedWall.geometry.parameters.height - groutThickness;
        }

        // Appliquer l'effet des joints avec repeat et offset
        selectedTexture.repeat.set(repeatX, repeatY);
        selectedTexture.offset.set(groutThickness / (2 * repeatX), groutThickness / (2 * repeatY));

        // Définir la couleur blanche pour les joints
        selectedWall.material.map = selectedTexture;
        selectedWall.material.color.set(0xffffff); // Couleur blanche pour les joints
        selectedWall.material.needsUpdate = true;
        console.log('Texture appliquée avec joints épais blancs autour de chaque pièce de carrelage.');
    } else {
        console.error('Veuillez sélectionner un mur ou le sol, puis une texture.');
    }
}

// Fonction pour ajuster la rotation de la texture lors d'un triple-clic
function adjustTextureRotation() {
    textureRotationAngle += Math.PI / 2; // Incrément de 90 degrés (π/2 radians)
    if (textureRotationAngle >= 2 * Math.PI) {
        textureRotationAngle = 0; // Réinitialiser après un tour complet
    }
    selectedTexture.rotation = textureRotationAngle; // Appliquer la rotation
    selectedWall.material.needsUpdate = true;
    console.log('Rotation de la texture ajustée à', textureRotationAngle);
}

function handleTripleClick() {
    clickCount++;
    if (clickCount === 3) {
        adjustTextureRotation();
        clickCount = 0; // Réinitialiser le compteur après le triple-clic
    }

    // Réinitialiser le compteur après un délai si un triple-clic n'est pas détecté
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
        clickCount = 0;
    }, 500); // Délai de 500ms pour détecter le triple-clic
}

// Sélectionner une texture dans la palette
document.querySelectorAll('.texture-option').forEach((img) => {
    img.addEventListener('click', () => {
        const textureLoader = new THREE.TextureLoader();
        selectedTexture = textureLoader.load(img.src, () => {
            console.log('Texture chargée :', img.src);
            applySelectedTexture();
        });
    });
});

function selectWall(wall) {
    selectedWall = wall;
    console.log('Élément sélectionné pour la texture :', wall);
}

function onClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([...walls, floor], true); // Vérifie les murs et le sol

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        if (walls.includes(clickedObject) || clickedObject === floor) {
            selectWall(clickedObject);
            handleTripleClick(); // Gérer le triple-clic pour ajuster la rotation
        }
    }
}

function onDoubleClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        let parentObject = clickedObject;

        // Parcourir les parents pour trouver l'objet sélectionnable
        while (parentObject && !parentObject.userData.isMovable) {
            parentObject = parentObject.parent;
        }

        if (parentObject && parentObject.userData.isMovable) {
            selectObject(parentObject);
        }
    } else {
        selectObject(null);
    }
}

function selectObject(object) {
    if (selectedObject) {
        transformControls.detach(selectedObject);
    }
    selectedObject = object;
    if (object && object.userData.isMovable) {
        transformControls.attach(object);
        console.log("Objet sélectionné :", selectedObject);
    }
}

function removeObject() {
    if (selectedObject && selectedObject.userData.isMovable) {
        saveAction('remove', selectedObject);
        scene.remove(selectedObject);
        objects = objects.filter(obj => obj !== selectedObject);
        transformControls.detach();
        selectedObject = null;
        console.log("Objet supprimé. Objets restants :", objects);
    }
}

function handleModelFile(event) {
    const file = event.target.files[0];
    const type = event.target.dataset.type;
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const extension = file.name.split('.').pop().toLowerCase();

            if (extension === 'gltf' || extension === 'glb') {
                gltfLoader.parse(arrayBuffer, '', function(gltf) {
                    handleModelLoad(gltf.scene, type);
                });
            } else if (extension === 'obj') {
                const text = new TextDecoder().decode(arrayBuffer);
                const objModel = objLoader.parse(text);
                handleModelLoad(objModel, type);
            } else if (extension === 'fbx') {
                fbxLoader.parse(arrayBuffer, function(fbx) {
                    handleModelLoad(fbx, type);
                });
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

function handleModelLoad(model, type) {
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    centerModel(model);

    if (type === 'sink') {
        sinkModel = model;
    } else if (type === 'mirror') {
        mirrorModel = model;
    } else if (type === 'bidet') {
        bidetModel = model;
    }

    console.log(`Modèle ${type} chargé avec succès`);
}

function centerModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.25 / maxDim;
    model.scale.multiplyScalar(scale);

    model.position.sub(center.multiplyScalar(scale));
    model.position.y = size.y * scale / 2;
    model.position.z = -2.4;
}

function addObject(model, type) {
    model.userData.type = type;
    model.userData.isMovable = true;
    scene.add(model);
    objects.push(model);
    selectObject(model);
    saveAction('add', model);
    console.log("Objet ajouté à la scène :", model);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function saveAction(action, object) {
    actionHistory.push({ action, object });
    redoStack = [];
}

// Gestion des interactions avec les modèles chargés
document.getElementById('sinkModelInput').addEventListener('change', event => handleModelFile(event), false);
document.getElementById('addSink').addEventListener('click', () => {
    if (sinkModel) {
        addObject(sinkModel.clone(), 'sink');
    } else {
        alert('Veuillez d\'abord charger un modèle de lavabo.');
    }
});
document.getElementById('addMirror').addEventListener('click', () => {
    if (mirrorModel) {
        addObject(mirrorModel.clone(), 'mirror');
    } else {
        alert('Veuillez d\'abord charger un modèle de miroir.');
    }
});
document.getElementById('addBidet').addEventListener('click', () => {
    if (bidetModel) {
        addObject(bidetModel.clone(), 'bidet');
    } else {
        alert('Veuillez d\'abord charger un modèle de bidet.');
    }
});
document.getElementById('removeObject').addEventListener('click', removeObject);

// Initialisation de la scène
init();
