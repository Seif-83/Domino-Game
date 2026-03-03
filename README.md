# Domino Master

A modern, mobile-friendly Domino game with standard rules and PVP/AI modes.

## Features
- **Standard Rules**: Highest double starts, round-based scoring, and stalemate detection.
- **Mobile Optimized**: Horizontal scrollable board and responsive controls.
- **Responsive Design**: Premium aesthetics with felt table textures and smooth animations.
- **Game Modes**: Practice against AI or play with friends in PVP rooms.

## How to Run Locally

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. **Clone or Download** the repository.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Set Environment Variables**:
   Create a `.env` file and add your credentials if needed (e.g., for Socket.io or Gemini AI features).
   ```env
   GEMINI_API_KEY=your_key_here
   ```
4. **Start Development Server**:
   ```bash
   npm run dev
   ```
5. **Open the Game**:
   Navigate to `http://localhost:3000` in your browser.

## Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS
- **Animations**: Framer Motion
- **Real-time**: Socket.io
- **Icons**: Lucide React
