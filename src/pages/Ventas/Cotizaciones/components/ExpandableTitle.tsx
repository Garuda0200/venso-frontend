import React, { useState } from "react";
import { MdExpandMore, MdExpandLess } from "react-icons/md";
import "./styles/ExpandableTitle.scss";

const ExpandableTitle = ({ title, maxLength = 50 }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!title || title.length <= maxLength) {
    return <span className="titulo-text">{title}</span>;
  }

  return (
    <div className="expandable-title">
      <span className="titulo-text">
        {isExpanded ? title : `${title.substring(0, maxLength)}...`}
      </span>
      <button
        className="expand-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        title={isExpanded ? "Contraer" : "Expandir"}
      >
        {isExpanded ? <MdExpandLess /> : <MdExpandMore />}
      </button>
    </div>
  );
};

export default ExpandableTitle;
