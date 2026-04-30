"use client";

import React, { useEffect, useRef } from "react";

export function FlowchartBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    let animationId: number;
    let time = 0;

    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const draw = () => {
      time += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;
      const isDark = document.documentElement.classList.contains("dark");

      const colors = isDark
        ? ["167, 139, 250", "251, 191, 36", "244, 114, 182", "52, 211, 153"]
        : ["139, 92, 246", "245, 158, 11", "236, 72, 153", "20, 184, 166"];

      for (let i = 0; i < 6; i++) {
        const baseX = seededRandom(i * 100) * w * 0.7 + w * 0.15;
        const baseY = seededRandom(i * 200) * h * 0.7 + h * 0.15;
        const x = baseX + Math.sin(time * 1.2 + i) * 12;
        const y = baseY + Math.cos(time * 0.9 + i * 0.5) * 10;
        const size = 3 + seededRandom(i * 300) * 4;
        const colorIdx = i % colors.length;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colors[colorIdx]}, ${0.18 + Math.sin(time + i) * 0.06})`;
        ctx.fill();
      }

      for (let i = 0; i < 3; i++) {
        const startX = w * (0.25 + seededRandom(i * 50) * 0.45);
        const startY = h * (0.15 + seededRandom(i * 60) * 0.35);
        const length = 25 + seededRandom(i * 70) * 30;
        const angle = -Math.PI / 4 + seededRandom(i * 80) * Math.PI / 2;
        const colorIdx = (i + 2) % colors.length;

        ctx.beginPath();
        ctx.moveTo(startX, startY);

        const cpX = startX + Math.cos(angle) * length * 0.5 + Math.sin(time * 1.5 + i) * 6;
        const cpY = startY + Math.sin(angle) * length * 0.5 + Math.cos(time * 1.3 + i) * 5;
        const endX = startX + Math.cos(angle) * length + Math.sin(time * 1.1 + i) * 3;
        const endY = startY + Math.sin(angle) * length + Math.cos(time * 1.6 + i) * 4;

        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.strokeStyle = `rgba(${colors[colorIdx]}, ${0.14 + Math.sin(time * 1.1 + i) * 0.05})`;
        ctx.lineWidth = 1.3 + seededRandom(i * 90) * 0.4;
        ctx.lineCap = "round";
        ctx.setLineDash([4, 7]);
        ctx.lineDashOffset = time * 12 + i * 10;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (let i = 0; i < 2; i++) {
        const cx = w * (0.35 + i * 0.28);
        const cy = h * (0.65 + seededRandom(i * 100) * 0.08);
        const radius = 10 + Math.sin(time * 1.0 + i * 1.2) * 3;
        const rotation = time * 0.25 + i * 0.7;
        const colorIdx = (i + 1) % colors.length;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);

        if (i === 0) {
          ctx.beginPath();
          for (let j = 0; j < 5; j++) {
            const a = (j * 2 * Math.PI) / 5 - Math.PI / 2;
            const px = Math.cos(a) * radius;
            const py = Math.sin(a) * radius;
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          ctx.beginPath();
          ctx.rect(-radius * 0.6, -radius * 0.6, radius * 1.2, radius * 1.2);
        }

        ctx.strokeStyle = `rgba(${colors[colorIdx]}, 0.22)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < 4; i++) {
        const rx = seededRandom(i * 400 + 1) * w * 0.8 + w * 0.1;
        const ry = seededRandom(i * 500 + 2) * h * 0.8 + h * 0.1;
        const rw = 20 + seededRandom(i * 600) * 25;
        const rh = 14 + seededRandom(i * 700) * 12;
        const rot = (seededRandom(i * 800) - 0.5) * 0.3;
        const colorIdx = (i + 3) % colors.length;

        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rot + Math.sin(time * 0.5 + i) * 0.03);
        ctx.beginPath();
        ctx.roundRect(-rw / 2, -rh / 2, rw, rh, 3);
        ctx.strokeStyle = `rgba(${colors[colorIdx]}, ${0.12 + Math.sin(time * 0.8 + i) * 0.04})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = time * 8 + i * 15;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      for (let i = 0; i < 2; i++) {
        const ax = w * (0.2 + seededRandom(i * 900) * 0.6);
        const ay = h * (0.3 + seededRandom(i * 1000) * 0.4);
        const al = 30 + seededRandom(i * 1100) * 20;
        const aa = seededRandom(i * 1200) * Math.PI * 2;
        const colorIdx = i % colors.length;

        const ex = ax + Math.cos(aa) * al;
        const ey = ay + Math.sin(aa) * al;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = `rgba(${colors[colorIdx]}, ${0.1 + Math.sin(time + i * 2) * 0.04})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.stroke();

        const headLen = 6;
        const headAngle = Math.atan2(ey - ay, ex - ax);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(headAngle - 0.4), ey - headLen * Math.sin(headAngle - 0.4));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(headAngle + 0.4), ey - headLen * Math.sin(headAngle + 0.4));
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}
