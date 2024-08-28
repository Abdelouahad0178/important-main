let scene, camera, renderer, controls, transformControls;
let walls = [], floor;
let objects = [];
let selectedObject = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let loadedTextures = {};
let gltfLoader = new THREE.GLTFLoader();
let objLoader = new THREE.OBJLoader();
let fbxLoader = new THREE.FBXLoader();
let sinkModel = null;
let mirrorModel = null;
let actionHistory = [];
let redoStack = [];

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

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    renderer.domElement.addEventListener('dblclick', onDoubleClick, false);
    window.addEventListener('keydown', onKeyDown, false);
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
    }
}

function createFloor() {
    const floorGeometry = new THREE.PlaneGeometry(5, 5);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
}

function handleTextureFiles(event) {
    const files = event.target.files;
    const reader = new FileReader();

    reader.onload = function(e) {
        const texture = new THREE.TextureLoader().load(e.target.result, function(tex) {
            loadedTextures['userTexture'] = tex;
            console.log('Texture chargée avec succès');
        }, undefined, function(error) {
            console.error('Erreur lors du chargement de la texture :', error);
        });
    };

    for (let i = 0; i < files.length; i++) {
        reader.readAsDataURL(files[i]);
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

function applyTextureToObject(object, texture) {
    if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(object === floor ? 3 : 2, object === floor ? 3 : 2);

        object.material.map = texture;
        object.material.needsUpdate = true;
    } else {
        console.error('La texture est indéfinie. Assurez-vous qu\'elle est correctement chargée.');
    }
}

function addObject(type) {
    let newObject;
    if (type === 'sink' && sinkModel) {
        newObject = sinkModel.clone();
    } else if (type === 'mirror' && mirrorModel) {
        newObject = mirrorModel.clone();
    } else {
        console.error(`Modèle ${type} non chargé. Veuillez d'abord importer un modèle.`);
        return;
    }
    
    newObject.userData.type = type;
    newObject.userData.isMovable = true;
    scene.add(newObject);
    objects.push(newObject);
    selectObject(newObject);
    saveAction('add', newObject);
    console.log("Objet ajouté à la scène :", newObject);
}

function selectObject(object) {
    if (selectedObject) {
        transformControls.detach(selectedObject);
    }
    selectedObject = object;
    if (object && object.userData.isMovable) {
        transformControls.attach(object);
    }
    console.log("Objet sélectionné :", selectedObject);
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

function onDoubleClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        let parentObject = clickedObject;
        
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

function onKeyDown(event) {
    if (event.key === 'Delete' && selectedObject && selectedObject.userData.isMovable) {
        removeObject();
    }
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

function undoAction() {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory.pop();
    redoStack.push(lastAction);

    if (lastAction.action === 'add') {
        scene.remove(lastAction.object);
    } else if (lastAction.action === 'remove') {
        scene.add(lastAction.object);
    }
}

function redoAction() {
    if (redoStack.length === 0) return;
    const lastRedo = redoStack.pop();
    actionHistory.push(lastRedo);

    if (lastRedo.action === 'add') {
        scene.add(lastRedo.object);
    } else if (lastRedo.action === 'remove') {
        scene.remove(lastRedo.object);
    }
}

function checkModelLoaded(type) {
    if ((type === 'sink' && !sinkModel) || (type === 'mirror' && !mirrorModel)) {
        alert(`Veuillez d'abord charger un modèle ${type} 3D.`);
        return false;
    }
    return true;
}

function printScene() {
    renderer.render(scene, camera);
    const imgData = renderer.domElement.toDataURL('image/png');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let isBlank = true;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
                isBlank = false;
                break;
            }
        }

        if (isBlank) {
            console.error("L'image capturée est entièrement blanche. Vérifiez le rendu de la scène.");
            alert("Erreur : L'image capturée est vide. Impossible d'imprimer.");
            return;
        }

        const date = new Date().toLocaleString();
        const printWindow = window.open('', 'Print', 'height=600,width=800');

        printWindow.document.write(`
            <html>
            <head>
                <title>Impression de la Scène 3D</title>
                <style>
                    @media print {
                        @page {
                            size: auto;
                            margin: 0mm;
                        }
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        max-width: 100%;
                        padding: 20px;
                    }
                    img {
                        max-width: 100%;
                        height: auto;
                        margin-bottom: 20px;
                    }
                    .info {
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <img src="${imgData}" alt="Scène 3D"/>
                    <div class="info">
                        <p>Date d'impression : ${date}</p>
                        <p>Dimensions de la pièce : 5m x 5m x 3m</p>
                        <p>Objets dans la scène : ${objects.length}</p>
                    </div>
                </div>
            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = function() {
            printWindow.print();
            printWindow.close();
        };
    };
    img.src = imgData;
}

// Event Listeners
document.getElementById('textureInput').addEventListener('change', handleTextureFiles, false);
document.getElementById('sinkModelInput').addEventListener('change', event => handleModelFile(event), false);
document.getElementById('mirrorModelInput').addEventListener('change', event => handleModelFile(event), false);
document.getElementById('changeWall1').addEventListener('click', () => {
    applyTextureToObject(walls[0], loadedTextures['userTexture']);
});
document.getElementById('changeWall2').addEventListener('click', () => {
    applyTextureToObject(walls[1], loadedTextures['userTexture']);
});
document.getElementById('changeFloor').addEventListener('click', () => {
    applyTextureToObject(floor, loadedTextures['userTexture']);
});
document.getElementById('addSink').addEventListener('click', () => {
    if (checkModelLoaded('sink')) addObject('sink');
});
document.getElementById('addMirror').addEventListener('click', () => {
    if (checkModelLoaded('mirror')) addObject('mirror');
});
document.getElementById('removeObject').addEventListener('click', removeObject);
document.getElementById('printScene').addEventListener('click', printScene);
document.getElementById('undoAction').addEventListener('click', undoAction);
document.getElementById('redoAction').addEventListener('click', redoAction);

// Initialisation
init();
