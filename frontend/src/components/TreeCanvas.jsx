import { useEffect, useMemo, useRef } from "react";

const hash = (value) =>
  [...value].reduce((total, character) => total + character.charCodeAt(0), 0);

const compactLabel = (text, maxLength = 12) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;

export const TreeCanvas = ({ topics, ideas, pulseIdeaId }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(0);

  const layout = useMemo(() => {
    const width = 980;
    const height = 640;
    const centerX = width / 2;
    const centerY = height / 2;
    const topicRadius = 180;

    const topicNodes = topics.map((topic, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(topics.length, 1) - Math.PI / 2;
      return {
        ...topic,
        x: centerX + Math.cos(angle) * topicRadius,
        y: centerY + Math.sin(angle) * topicRadius,
        angle
      };
    });

    const ideaNodes = ideas.map((idea, index) => {
      const topic = topicNodes.find((node) => node.id === idea.topicId);
      const seed = hash(idea.id);
      const angleJitter = ((seed % 90) - 45) * (Math.PI / 180);
      const radialStep = 120 + (index % 5) * 28;
      return {
        ...idea,
        topic,
        x: topic.x + Math.cos(topic.angle + angleJitter) * radialStep,
        y: topic.y + Math.sin(topic.angle + angleJitter) * radialStep
      };
    });

    return { centerX, centerY, topicNodes, ideaNodes };
  }, [ideas, topics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let frame = 0;

    const draw = () => {
      frame += 1;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const gradient = context.createRadialGradient(
        layout.centerX,
        layout.centerY,
        20,
        layout.centerX,
        layout.centerY,
        420
      );
      gradient.addColorStop(0, "rgba(45, 212, 191, 0.18)");
      gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.strokeStyle = "rgba(148, 163, 184, 0.32)";
      context.lineWidth = 2;
      layout.topicNodes.forEach((topic) => {
        context.beginPath();
        context.moveTo(layout.centerX, layout.centerY);
        context.lineTo(topic.x, topic.y);
        context.stroke();
      });

      context.strokeStyle = "rgba(94, 234, 212, 0.32)";
      layout.ideaNodes.forEach((idea) => {
        context.beginPath();
        context.moveTo(idea.topic.x, idea.topic.y);
        context.lineTo(idea.x, idea.y);
        context.stroke();
      });

      context.fillStyle = "#14b8a6";
      context.beginPath();
      context.arc(layout.centerX, layout.centerY, 28, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ecfeff";
      context.font = "bold 14px sans-serif";
      context.textAlign = "center";
      context.fillText("MAIN", layout.centerX, layout.centerY + 5);

      layout.topicNodes.forEach((topic) => {
        context.fillStyle = "#0f172a";
        context.beginPath();
        context.arc(topic.x, topic.y, 34, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(94, 234, 212, 0.8)";
        context.lineWidth = 3;
        context.stroke();
        context.fillStyle = "#f8fafc";
        context.font = "bold 13px sans-serif";
        context.fillText(topic.title, topic.x, topic.y + 4);
      });

      layout.ideaNodes.forEach((idea) => {
        const radius = 18 + Math.min(idea.stars, 10) * 2.2;
        const pulsing = idea.id === pulseIdeaId;
        const glow = pulsing ? 10 + Math.sin(frame / 4) * 6 : 0;

        context.save();
        context.shadowColor = pulsing ? "rgba(251, 191, 36, 0.9)" : "rgba(94, 234, 212, 0.6)";
        context.shadowBlur = 10 + glow;
        context.fillStyle = pulsing ? "#f59e0b" : "#0f766e";
        context.beginPath();
        context.arc(idea.x, idea.y, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();

        context.fillStyle = "#f8fafc";
        context.font = "12px sans-serif";
        context.fillText(compactLabel(idea.text), idea.x, idea.y - 3);
        context.fillStyle = "#fde68a";
        context.fillText(`⭐ ${idea.stars}`, idea.x, idea.y + 14);
      });

      animationRef.current = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationRef.current);
  }, [layout, pulseIdeaId]);

  return <canvas ref={canvasRef} width={980} height={640} className="tree-canvas" />;
};
