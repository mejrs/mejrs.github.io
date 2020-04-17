'use strict';
const CANVAS_HEIGHT = 512;
const CANVAS_WIDTH = 512;
const SIZE = 4; //must be 2^n

const canvas = document.getElementById('canvas')
    const ctx = canvas.getContext('2d');

class Rect {
    static instances = [];

    constructor(SIZE, color) {
        this.color = color;
        this.size = SIZE;
        this.bit = 2;
        this.dragState = false;
        Rect.instances.push(this);
    }

    addToCanvas(canvas, x, y) {
		if (this.collision(x,y)){
			//console.error("You cannot have two rectangles on the same tile");
		}
        this.x = x;
        this.y = y;
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.canvas.addEventListener('mousemove', this.mousemove.bind(this));
        this.canvas.addEventListener('mousedown', this.mousedown.bind(this));

        this.draw();
    }
    mousemove(e) {
        let detectedX = e.layerX >> this.bit;
        let detectedY = e.layerY >> this.bit;
        if (this.dragState === true && !this.hits(detectedX, detectedY) && !this.collision(detectedX, detectedY)) {
            this.x = detectedX;
            this.y = detectedY;
            setTimeout(() => this.refresh(), 0);
        }

    }
    mousedown(e) {
        let detectedX = e.layerX >> this.bit;
        let detectedY = e.layerY >> this.bit;
        if (this.hits(detectedX, detectedY)) {
            this.dragState = true;
            window.addEventListener('mouseup', this.mouseup.bind(this), {
                once: true
            });
        }
    }
    mouseup() {
        if (this.dragState) {
            this.dragState = false;
        }

    }
	
	collision(detectedX, detectedY){
		return Rect.instances.some(rect => (rect.x === detectedX && rect.y === detectedY ))
	}

    checkIfMove(new_x, new_y) {
        return (this.x !== new_x || this.y !== new_y)
    }
    draw() {
        this.ctx.fillStyle = this.color;
        this.ctx.fillRect(this.size * this.x, this.size * this.y, this.size, this.size);
    }

    refresh() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        Rect.instances.forEach(rect => {
            if (this.canvas === rect.canvas) {
                rect.draw()
            }
        });
    }

    hits(x, y) {
        return (this.x === x && this.y === y)
    }

}

new Rect(SIZE, 'green').addToCanvas(canvas, 52, 48);
new Rect(SIZE, 'red').addToCanvas(canvas, 108, 103);

