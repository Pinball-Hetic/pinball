import React from 'react';
import { Ball } from '@pinball/game-engine';

const HomePage: React.FC = () => {
  const ball = new Ball(1, 'red');
  return (
    <div>
      <h1>Welcome to Pinball Monorepo</h1>
      <p>Ball initialized: {ball.color} ball with radius {ball.radius}</p>
    </div>
  );
};

export default HomePage;
