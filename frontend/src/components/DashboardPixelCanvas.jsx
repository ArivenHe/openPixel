import { useEffect, useRef } from "react";

const SIZE = 100;
const CANVAS_SIZE = 640;

export const DashboardPixelCanvas = ({ canvas, events }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(0);

  useEffect(() => {
    const element = canvasRef.current;
    const context = element.getContext("2d");
    const cell = CANVAS_SIZE / SIZE;

    const draw = () => {
      context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      canvas.forEach((color, index) => {
        const x = index % SIZE;
        const y = Math.floor(index / SIZE);
        context.fillStyle = color || "#ffffff";
        context.fillRect(x * cell, y * cell, cell, cell);
      });

      context.strokeStyle = "rgba(15, 23, 42, 0.04)";
      for (let index = 0; index <= SIZE; index += 1) {
        const pos = index * cell;
        context.beginPath();
        context.moveTo(pos, 0);
        context.lineTo(pos, CANVAS_SIZE);
        context.stroke();
        context.beginPath();
        context.moveTo(0, pos);
        context.lineTo(CANVAS_SIZE, pos);
        context.stroke();
      }

      events.forEach((event) => {
        const x = event.x * cell + cell / 2;
        const y = event.y * cell + cell / 2;
        const age = Math.min(1, (Date.now() - new Date(event.createdAt).getTime()) / 800);
        context.strokeStyle = `rgba(251, 191, 36, ${1 - age})`;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x, y, cell * 0.8 + age * 20, 0, Math.PI * 2);
        context.stroke();
      });

      if (events.length > 0) {
        animationRef.current = window.requestAnimationFrame(draw);
      }
    };

    draw();
    return () => window.cancelAnimationFrame(animationRef.current);
  }, [canvas, events]);

  return <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="dashboard-pixel-canvas" />;
};
