import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import { GUI } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/libs/dat.gui.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
import { NRRDLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/shaders/VolumeShader.js';
import { WEBGL } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/WebGL.js';
import { GPUComputationRenderer } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/misc/GPUComputationRenderer.js';

if ( WEBGL.isWebGL2Available() === false ) {

    document.body.appendChild( WEBGL.getWebGL2ErrorMessage() );

}

const WIDTH = 512;

let renderer,
    scene,
    camera,
    material,
    alternateMaterial,
    container,
    fireMesh,
    alternateFireMesh,
    advectVariable,
    advectUniforms,
    divergenceVariable,
    divergenceUniforms,
    jacobiVariable,
    jacobiUniforms,
    outputVariable,
    outputUniforms,
    divergenceShader,
    divergenceShaderTarget,
    outputTexture,
    jacobiShader,
    jacobiShaderTarget,
    outputShader,
    gpuCompute;

init();
animate();

function init() {

    container = document.createElement( 'div' );
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);

    scene = new THREE.Scene();

    // Probably don't need this

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    window.addEventListener( 'resize', onWindowResize );

    init_fire();
}

function create_3d_tex() {
    // create a 2d texture that encodes 3d data, e.g. the texture below is a 3 x 2 x 6 cube
    /*
    1 1 1 2 2 2
    1 1 1 2 2 2
    3 3 3 4 4 4
    3 3 3 4 4 4
    5 5 5 6 6 6
    5 5 5 6 6 6
    */
    // Texture size: 512 x 512 = 8 x 8 x 64 x 64 = 64 x 64 x 64
    // sample 2d texture like it is 3d 
    //const velocityMap0 = gpuCompute.createTexture();
    //const pressureMap0 = gpuCompute.createTexture();
    //const divergenceMap0 = gpuCompute.createTexture();

    /*var p = 0;
    for (var j = 0; j < 8; j++) {
        for (var i = 0; i < 8; i++) {
            for (var y = 0; y < 64; y++) {
                for (var x = 0; x < 64; x++) {
                    p = (j * 64 + y) * 512 + (i * 64 + x);
                    p *= 4;
                    pixels[p] = (8 - i) / 8;
                    pixels[p + 1] = (8 - j) / 8;
                    pixels[p + 2] = 0.0;
                    pixels[p + 3] = 1.0;
                    //p += 4;
                }
            }
        }
    }*/
}

function init_fire() {
    const geometry = new THREE.PlaneGeometry(WIDTH, WIDTH, WIDTH, WIDTH);
    material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge( [
            THREE.ShaderLib['phong'].uniforms, 
            {
                map: {value: null},
            }
        ]),
        vertexShader: document.getElementById('vertexShader').textContent,
        fragmentShader: document.getElementById('fragmentShader').textContent
    });

    alternateMaterial = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge( [
            THREE.ShaderLib['phong'].uniforms, 
            {
                map: {value: null},
            }
        ]),
        vertexShader: document.getElementById('vertexShader').textContent,
        fragmentShader: document.getElementById('fragmentShader').textContent
    });

    fireMesh = new THREE.Mesh(geometry, material);
    alternateFireMesh = new THREE.Mesh(geometry, alternateMaterial);
    scene.add(fireMesh);
    scene.add(alternateFireMesh);

    gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    

    var divergenceMap = gpuCompute.createTexture();
    var pressureMap = gpuCompute.createTexture();
    var velocityMap = gpuCompute.createTexture();
    var outputMap = gpuCompute.createTexture();

    fillTexture(divergenceMap);
    fillTexture(pressureMap);
    fillTexture(velocityMap);
    fillTexture(outputMap);
    

    advectVariable = gpuCompute.addVariable("advectVariable", document.getElementById("advectShader").textContent, velocityMap);
    gpuCompute.setVariableDependencies(advectVariable, [advectVariable]);
    advectUniforms = advectVariable.material.uniforms;
    advectUniforms['timestep'] = {value: 0.01};
    advectUniforms['velocitySampler'] = {value: null};

    advectVariable.wrapS = THREE.RepeatWrapping;
    advectVariable.wrapT = THREE.RepeatWrapping;

    divergenceVariable = gpuCompute.addVariable("divergenceVariable", document.getElementById("divergenceShader").textContent, divergenceMap);
    gpuCompute.setVariableDependencies(divergenceVariable, [divergenceVariable, advectVariable]);
    divergenceUniforms = divergenceVariable.material.uniforms;
    divergenceUniforms["velocitySampler"] = {value: null};

    divergenceVariable.wrapS = THREE.RepeatWrapping;
    divergenceVariable.wrapT = THREE.RepeatWrapping;

    jacobiVariable = gpuCompute.addVariable("jacobiVariable", document.getElementById("jacobiShader").textContent, pressureMap);
    gpuCompute.setVariableDependencies(jacobiVariable, [jacobiVariable, divergenceVariable, advectVariable]);
    jacobiUniforms = jacobiVariable.material.uniforms;
    jacobiUniforms["velocitySampler"] = {value: null};
    jacobiUniforms["pressureSampler"] = {value: null};
    jacobiUniforms["divergenceSampler"] = {value: null};

    jacobiVariable.wrapS = THREE.RepeatWrapping;
    jacobiVariable.wrapT = THREE.RepeatWrapping;

    outputVariable = gpuCompute.addVariable("outputVariable", document.getElementById("outputShader").textContent, outputMap);
    gpuCompute.setVariableDependencies(outputVariable, [outputVariable, jacobiVariable, advectVariable]);
    outputUniforms = outputVariable.material.uniforms;
    outputUniforms["velocitySampler"] = {value: null};
    outputUniforms["pressureSampler"] = {value: null};

    outputVariable.wrapS = THREE.RepeatWrapping;
    outputVariable.wrapT = THREE.RepeatWrapping;



    const error = gpuCompute.init();
    if (error != null) {
        console.log(error);
    }

    /*divergenceShader = gpuCompute.createShaderMaterial(document.getElementById("divergenceShader").textContent, {
        velocitySampler: {value : null}
    });

    jacobiShader = gpuCompute.createShaderMaterial(document.getElementById("jacobiShader").textContent, {
        velocitySampler: {value : null},
        divergenceSampler: {value : null},
        pressureSampler: {value : null}
    });

    jacobiShader.uniforms.pressureSampler.value = pressureMap;

    outputShader = gpuCompute.createShaderMaterial(document.getElementById("outputShader").textContent, {
        pressureSampler: {value: null},
        velocitySampler: {value: null},
    }) 


    divergenceShaderTarget = gpuCompute.createRenderTarget();
    jacobiShaderTarget = gpuCompute.createRenderTarget();*/

}

function fillTexture(texture) {
    const pixels = texture.image.data;
    var p = 0;
    for (var i = 0; i < WIDTH; i++) {
        for (var j = 0; j < WIDTH; j++) {
            pixels[p] = 0.0;
            pixels[p + 1] = 0.0;
            pixels[p + 2] = 0.0;
            pixels[p + 3] = 1.0;
            p += 4;
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
}

function animate() {
    requestAnimationFrame(animate);
    update();
    render();
}

function divergenceUpdate() {
    const currentRenderTarget = gpuCompute.getCurrentRenderTarget(advectVariable);
    const alternateRenderTarget = gpuCompute.getAlternateRenderTarget(advectVariable);

    divergenceShader.uniforms["velocitySampler"].value = currentRenderTarget.texture;
    gpuCompute.doRenderTarget(divergenceShader, divergenceShaderTarget);

}

function jacobiIteration() {
    const currentRenderTarget = gpuCompute.getCurrentRenderTarget(advectVariable);
    jacobiShader.uniforms["velocitySampler"].value = currentRenderTarget.texture;
    jacobiShader.uniforms["divergenceSampler"].value = divergenceShaderTarget.texture;
    
    gpuCompute.doRenderTarget(jacobiShader, jacobiShaderTarget);
    jacobiShader.uniforms["pressureSampler"].value = jacobiShaderTarget.texture;
}

function neutralPressure() {
    const currentRenderTarget = gpuCompute.getCurrentRenderTarget(advectVariable);
    const alternateRenderTarget = gpuCompute.getAlternateRenderTarget(advectVariable);

    outputShader.uniforms["pressureSampler"].value = jacobiShaderTarget.texture;
    outputShader.uniforms["velocitySampler"].value = currentRenderTarget.texture;
    gpuCompute.doRenderTarget(outputShader, alternateRenderTarget);

    outputShader.uniforms["velocitySampler"].value = alternateRenderTarget.texture;
    gpuCompute.doRenderTarget(outputShader, currentRenderTarget);

}

function update() {
    let advectTexture = gpuCompute.getCurrentRenderTarget(advectVariable).texture;
    

    let advectAltTexture = gpuCompute.getAlternateRenderTarget(advectVariable).texture;
    
    advectUniforms['velocitySampler'].value = advectTexture; 
    
    divergenceUniforms["velocitySampler"].value = advectTexture;
    let divergenceTexture = gpuCompute.getCurrentRenderTarget(divergenceVariable).texture;

    //let divergenceAltTexture = gpuCompute.getAlternateRenderTarget(divergenceVariable).texture;
    
    jacobiUniforms["velocitySampler"].value = advectTexture;
    jacobiUniforms["divergenceSampler"].value = divergenceTexture;
    let jacobiTexture = gpuCompute.getCurrentRenderTarget(jacobiVariable).texture;

    let jacobiAltTexture = gpuCompute.getAlternateRenderTarget(jacobiVariable).texture;
    jacobiUniforms["pressureSampler"].value = jacobiTexture;


    outputUniforms["velocitySampler"].value = advectTexture;
    outputUniforms["pressureSampler"].value = jacobiTexture;

    outputTexture = gpuCompute.getCurrentRenderTarget(outputVariable).texture;
    material.uniforms.map.value = outputTexture;

    let outputAltTexture = gpuCompute.getAlternateRenderTarget(outputVariable).texture;
    alternateMaterial.uniforms.map.value = outputAltTexture;
    

    
    

    gpuCompute.compute();
    
    //divergenceUpdate();
    //jacobiIteration();
    //neutralPressure();
}


function render () {
    
    renderer.render(scene, camera);
    advectUniforms["velocitySampler"].value = outputTexture;
}

