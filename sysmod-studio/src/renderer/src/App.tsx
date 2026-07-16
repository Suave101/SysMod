import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import DesignBrief from './views/DesignBrief';
import ArchitectureCanvas from './views/ArchitectureCanvas';
import Brainstorming from './views/Brainstorming';
import Moscow from './views/Moscow';

export default function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        {/* Default route redirects to the Design Brief */}
        <Route path="/" element={<Navigate to="/design-brief" replace />} />
        
        <Route path="/design-brief" element={<DesignBrief />} />
        <Route path="/architecture" element={<ArchitectureCanvas />} />
        <Route path="/brainstorming" element={<Brainstorming />} />
        <Route path="/moscow" element={<Moscow />} />
      </Routes>
    </HashRouter>
  );
}