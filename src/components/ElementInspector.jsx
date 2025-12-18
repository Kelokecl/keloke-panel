
import React, { useState, useEffect, useRef } from 'react';

const ElementInspector = ({ children, buttonPosition = 'top-right' }) => {
  const [isInspecting, setIsInspecting] = useState(false);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [showAIInput, setShowAIInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [buttonPos, setButtonPos] = useState(null);
  
  const originalStyles = useRef(new Map());
  const dragStart = useRef({ x: 0, y: 0 });
  const buttonRef = useRef(null);
  const wasDragged = useRef(false);

  // Initialize button position based on buttonPosition prop
  useEffect(() => {
    if (!buttonPos && buttonRef.current) {
      const getInitialPosition = () => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 16;
        const buttonWidth = buttonRef.current.offsetWidth;
        const buttonHeight = buttonRef.current.offsetHeight;
        
        switch (buttonPosition) {
          case 'top-left':
            return { x: margin, y: margin };
          case 'top-right':
            return { x: viewportWidth - buttonWidth - margin, y: margin };
          case 'bottom-left':
            return { x: margin, y: viewportHeight - buttonHeight - margin };
          case 'bottom-right':
            return { x: viewportWidth - buttonWidth - margin, y: viewportHeight - buttonHeight - margin };
          default:
            return { x: viewportWidth - buttonWidth - margin, y: margin };
        }
      };
      setButtonPos(getInitialPosition());
    }
  }, [buttonPos, buttonPosition]);

  // Handle drag start (both mouse and touch)
  const handleDragStart = (e) => {
    if (e.target.closest('[data-inspector-ui]') && !e.target.closest('input')) {
      e.preventDefault();
      wasDragged.current = false;
      setIsDragging(true);
      
      // Get client position from either mouse or touch event
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      dragStart.current = {
        x: clientX - (buttonPos?.x || 0),
        y: clientY - (buttonPos?.y || 0)
      };
    }
  };

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e) => {
      if (!buttonRef.current) return;
      
      // Prevent default to avoid scrolling on mobile
      if (e.touches) {
        e.preventDefault();
      }
      
      wasDragged.current = true;
      
      // Get client position from either mouse or touch event
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const newX = clientX - dragStart.current.x;
      const newY = clientY - dragStart.current.y;
      
      setButtonPos({ x: newX, y: newY });
    };

    const handleEnd = () => {
      setIsDragging(false);
      
      // Snap to corners based on quadrants
      if (buttonPos && buttonRef.current) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 16;
        
        const buttonWidth = buttonRef.current.offsetWidth;
        const buttonHeight = buttonRef.current.offsetHeight;
        
        const buttonCenterX = buttonPos.x + buttonWidth / 2;
        const buttonCenterY = buttonPos.y + buttonHeight / 2;
        
        const isLeft = buttonCenterX < viewportWidth / 2;
        const isTop = buttonCenterY < viewportHeight / 2;
        
        let finalX, finalY;
        
        if (isTop && isLeft) {
          finalX = margin;
          finalY = margin;
        } else if (isTop && !isLeft) {
          finalX = viewportWidth - buttonWidth - margin;
          finalY = margin;
        } else if (!isTop && isLeft) {
          finalX = margin;
          finalY = viewportHeight - buttonHeight - margin;
        } else {
          finalX = viewportWidth - buttonWidth - margin;
          finalY = viewportHeight - buttonHeight - margin;
        }
        
        setButtonPos({ x: finalX, y: finalY });
      }
    };

    // Add both mouse and touch event listeners
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, buttonPos]);

  useEffect(() => {
    const handleMouseOver = (e) => {
      if (!isInspecting) return;
      
      if (e.target.closest('[data-inspector-ui]')) return;
      
      e.stopPropagation();
      setHoveredElement(e.target);
    };

    const handleMouseOut = (e) => {
      if (!isInspecting) return;
      
      e.stopPropagation();
      setHoveredElement(null);
    };

    const handleClick = (e) => {
      if (!isInspecting) return;
      
      if (e.target.closest('[data-inspector-ui]')) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      setSelectedElement(e.target);
      
      const computedStyles = window.getComputedStyle(e.target);
      originalStyles.current.set(e.target, {
        color: computedStyles.color,
        backgroundColor: computedStyles.backgroundColor,
        fontSize: computedStyles.fontSize,
        fontWeight: computedStyles.fontWeight,
        padding: computedStyles.padding,
        margin: computedStyles.margin,
        borderRadius: computedStyles.borderRadius,
        border: computedStyles.border,
        textContent: e.target.textContent,
        display: computedStyles.display,
        flexDirection: computedStyles.flexDirection,
        justifyContent: computedStyles.justifyContent,
        alignItems: computedStyles.alignItems
      });
      
      setIsInspecting(false);
      setHoveredElement(null);
      setShowAIInput(true);
    };

    if (isInspecting) {
      document.addEventListener('mouseover', handleMouseOver, true);
      document.addEventListener('mouseout', handleMouseOut, true);
      document.addEventListener('click', handleClick, true);
      document.body.style.cursor = 'crosshair';
    }

    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('click', handleClick, true);
      document.body.style.cursor = 'default';
    };
  }, [isInspecting]);

  useEffect(() => {
    if (hoveredElement && isInspecting) {
      hoveredElement.style.outline = '3px solid #000';
      hoveredElement.style.outlineOffset = '2px';
      hoveredElement.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
    }

    return () => {
      if (hoveredElement) {
        hoveredElement.style.outline = '';
        hoveredElement.style.outlineOffset = '';
        hoveredElement.style.backgroundColor = '';
      }
    };
  }, [hoveredElement, isInspecting]);

  useEffect(() => {
    if (selectedElement && showAIInput) {
      selectedElement.style.outline = '3px solid #000';
      selectedElement.style.outlineOffset = '2px';
      selectedElement.style.boxShadow = '0 0 0 4px rgba(0, 0, 0, 0.1)';
    }

    return () => {
      if (selectedElement && !isInspecting) {
        selectedElement.style.outline = '';
        selectedElement.style.outlineOffset = '';
        selectedElement.style.boxShadow = '';
      }
    };
  }, [selectedElement, showAIInput, isInspecting]);

  const toggleInspector = (e) => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    
    if (showAIInput) {
      closeAIInput();
    }
    setIsInspecting(!isInspecting);
    if (hoveredElement) {
      hoveredElement.style.outline = '';
      hoveredElement.style.outlineOffset = '';
      hoveredElement.style.backgroundColor = '';
      setHoveredElement(null);
    }
  };

  const processAIRequest = async () => {
    if (!aiPrompt.trim() || !selectedElement) return;

    setIsProcessing(true);
    console.log('PROCESSING REQUEST')

    // Try to get the component file path from React Fiber
    const getComponentFilePath = (element) => {
      try {
        // Look for React Fiber node
        const fiberKey = Object.keys(element).find(key => 
          key.startsWith('__reactFiber') || 
          key.startsWith('__reactInternalInstance')
        );
        
        if (fiberKey) {
          let fiber = element[fiberKey];
          const componentFiles = [];
          
          // Walk up the fiber tree to find component names
          while (fiber && componentFiles.length < 10) {
            // Get component type/name
            if (fiber.type) {
              let componentName = null;
              
              if (typeof fiber.type === 'function') {
                componentName = fiber.type.displayName || fiber.type.name;
              } else if (typeof fiber.type === 'string') {
                componentName = fiber.type;
              }
              
              // Look for _source which contains file info in development
              if (fiber._debugSource && fiber._debugSource.fileName) {
                const fileName = fiber._debugSource.fileName;
                const cleanPath = fileName.replace(/^.*\//, '/');
                componentFiles.push({
                  name: componentName || 'Unknown',
                  file: cleanPath,
                  line: fiber._debugSource.lineNumber
                });
              } else if (componentName && componentName !== 'Unknown' && !['div', 'span', 'button', 'input', 'form', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'img'].includes(componentName)) {                                            
                // If we have a component name but no file, try to infer it
                const inferredPath = componentName.includes('App') ? '/App.js' : `/components/${componentName}.js`;                                                                                                  
                componentFiles.push({
                  name: componentName,
                  file: inferredPath,
                  line: null
                });
              }
            }
            
            fiber = fiber.return;
          }
          
          // Return the most specific component (first in the list)
          if (componentFiles.length > 0) {
            return componentFiles[0];
          }
        }
      } catch (error) {
        console.log('Error getting component file path:', error);
      }
      
      return null;
    };

    const componentInfo = getComponentFilePath(selectedElement);
    
    // Get parent element context
    const parentTag = selectedElement.parentElement ? selectedElement.parentElement.tagName.toLowerCase() : 'unknown';                                                                                                  
    const parentClass = selectedElement.parentElement?.className || 'none';

    const output = `
Selected Element:
Tag: ${ selectedElement.tagName.toLowerCase() }
ID: ${ selectedElement.id || null }
Classes: ${ selectedElement.className || null }
Text: ${ selectedElement.textContent?.trim().slice(0, 50) || null }
Parent: ${ parentTag } (class: ${ parentClass })
Component File: ${ componentInfo ? componentInfo.file : 'Unknown - search in /components or /App.js' }${ componentInfo?.line ? ` (line ${componentInfo.line})` : '' }                                              
Component Name: ${ componentInfo ? componentInfo.name : 'Unknown' }

CRITICAL INSTRUCTION:
You MUST use the loadFileContents tool to read the Component File above before making any changes.
The file path to load is: ${ componentInfo ? componentInfo.file : '/App.js' }
Use str_replace_based_edit_tool or editFile tool to make changes.

User Request:
${ aiPrompt }
`
    
    console.log(output);
    
    // Simulate processing - replace this with your actual API call
    // await new Promise(resolve => setTimeout(resolve, 2000));
    
    // setIsProcessing(false);
    // closeAIInput();
  };

  const resetElement = () => {
    if (selectedElement && originalStyles.current.has(selectedElement)) {
      const original = originalStyles.current.get(selectedElement);
      Object.keys(original).forEach(key => {
        if (key === 'textContent') {
          selectedElement.textContent = original[key];
        } else {
          selectedElement.style[key] = original[key];
        }
      });
    }
  };

  const getElementPosition = () => {
    if (!selectedElement) return { top: 0, left: 0 };
    
    const rect = selectedElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = 320;
    const panelHeight = 60;
    const gap = 8;
    const margin = 16;
    
    let top = rect.bottom + gap;
    let left = rect.left;
    
    if (top + panelHeight > viewportHeight - margin) {
      const topPosition = rect.top - panelHeight - gap;
      if (topPosition >= margin) {
        top = topPosition;
      } else {
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        if (spaceBelow > spaceAbove) {
          top = Math.max(rect.bottom + gap, viewportHeight - panelHeight - margin);
        } else {
          top = Math.max(margin, rect.top - panelHeight - gap);
        }
      }
    }
    
    const elementCenter = rect.left + (rect.width / 2);
    const screenCenter = viewportWidth / 2;
    
    if (elementCenter <= screenCenter) {
      left = rect.left;
      
      if (left < margin) {
        left = margin;
      }
      if (left + panelWidth > viewportWidth - margin) {
        left = viewportWidth - panelWidth - margin;
      }
    } else {
      left = rect.right - panelWidth;
      
      if (left + panelWidth > viewportWidth - margin) {
        left = viewportWidth - panelWidth - margin;
      }
      if (left < margin) {
        left = margin;
      }
    }
    
    return { top, left };
  };

  useEffect(() => {
    if (!showAIInput || !selectedElement) return;

    const updatePanelPosition = () => {
      const panel = document.querySelector('[data-ai-input-panel]');
      if (panel) {
        const position = getElementPosition();
        panel.style.top = `${ position.top }px`;
        panel.style.left = `${ position.left }px`;
        
        panel.style.visibility = 'visible';
        panel.style.opacity = '1';
      }
    };

    const updateTriggers = [
      () => setTimeout(updatePanelPosition, 0),
      () => setTimeout(updatePanelPosition, 10),
      () => setTimeout(updatePanelPosition, 50),
      () => requestAnimationFrame(updatePanelPosition),
    ];

    updateTriggers.forEach(trigger => trigger());
    
    let ticking = false;
    const handlePositionUpdate = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updatePanelPosition();
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener('scroll', handlePositionUpdate, { passive: true });
    window.addEventListener('resize', handlePositionUpdate, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handlePositionUpdate);
      window.removeEventListener('resize', handlePositionUpdate);
    };
  }, [showAIInput, selectedElement]);

  const closeAIInput = () => {
    if (selectedElement) {
      selectedElement.style.outline = '';
      selectedElement.style.outlineOffset = '';
      selectedElement.style.boxShadow = '';
    }
    setShowAIInput(false);
    setSelectedElement(null);
    setAiPrompt('');
    setIsInspecting(false);
    console.log('CLOSE INSPECTION')
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      processAIRequest();
    }
  };

  const getButtonStyle = () => {
    if (!buttonPos) return {};
    
    return {
      position: 'fixed',
      left: `${buttonPos.x}px`,
      top: `${buttonPos.y}px`,
      transition: isDragging ? 'none' : 'all 0.3s ease-out',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none'
    };
  };

  return (
    <div className="relative">
      {children}
      
      {/* Toggle Inspector Button */}
      <button
        ref={buttonRef}
        onClick={toggleInspector}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        data-inspector-ui
        className={`z-50 px-3 h-10 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-600/90 transition-colors flex items-center justify-center gap-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={getButtonStyle()}
        title={isInspecting ? "Stop Inspecting" : "Start Inspecting"}
      >
        <span className="text-sm font-medium whitespace-nowrap">Editar</span>
        {isInspecting ? (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83l3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75z"/>
          </svg>
        )}
      </button>
      
      {/* AI Input Panel - Positioned relative to selected element */}
      {showAIInput && selectedElement && (
        <div 
          className="fixed z-50 transition-all duration-200" 
          data-inspector-ui
          data-ai-input-panel
          style={{ 
            width: '320px',
            top: `${ getElementPosition().top }px`, 
            left: `${ getElementPosition().left }px`,
            visibility: 'hidden',
            opacity: '0'
          }}
        >
          <div className="bg-white border border-gray-200 rounded-lg shadow-xl">
            <div className="flex items-center gap-2 p-3">
              {/* Close button (X) */}
              <button
                onClick={closeAIInput}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-sm hover:bg-gray-100"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="¿Qué quieres cambiar?"
                className="flex-1 px-3 py-1 text-black text-[16px] border-0 focus:outline-none placeholder-gray-400"
                disabled={isProcessing}
                autoFocus
              />
              <button
                onClick={processAIRequest}
                disabled={!aiPrompt.trim() || isProcessing}
                className="px-2 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {isProcessing ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin">
                    <path d="M8 1.5V4.5M8 11.5V14.5M3.75 3.75L5.85 5.85M10.15 10.15L12.25 12.25M1.5 8H4.5M11.5 8H14.5M3.75 12.25L5.85 10.15M10.15 5.85L12.25 3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3L13 8L11.5 9.5L9 7V13H7V7L4.5 9.5L3 8L8 3Z" fill="currentColor"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ElementInspector;
