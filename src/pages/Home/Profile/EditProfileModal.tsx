import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaUser, FaPhone } from "react-icons/fa";
import "./EditProfileModal.scss";

export function EditProfileModal({
  isOpen,
  onClose,
  onUpdate,
  profileData,
  isLoading,
}) {
  const [formData, setFormData] = useState({
    nombre: "",
    apellidopaterno: "",
    apellidomaterno: "",
    telefono: "",
  });

  const [errors, setErrors] = useState({});

  // Set form data when modal opens or profile data changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        nombre: profileData.nombre || "",
        apellidopaterno: profileData.apellidoPaterno || "",
        apellidomaterno: profileData.apellidoMaterno || "",
        telefono: profileData.telefono || "",
      });
      setErrors({});
    }
  }, [isOpen, profileData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    // Clear error when field is edited
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: null,
      });
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.nombre.trim()) {
      newErrors.nombre = "El nombre es requerido";
    }

    if (!formData.apellidopaterno.trim()) {
      newErrors.apellidopaterno = "El apellido paterno es requerido";
    }

    if (!formData.telefono.trim()) {
      newErrors.telefono = "El teléfono es requerido";
    } else if (!/^\d{9,10}$/.test(formData.telefono.trim())) {
      newErrors.telefono = "Ingrese un número de teléfono válido";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validate()) {
      const updateData = {
        nombre: formData.nombre,
        apellidopaterno: formData.apellidopaterno,
        apellidomaterno: formData.apellidomaterno,
        telefono: formData.telefono,
      };

      const result = await onUpdate(updateData);
      if (result) {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-container animate-slide-up">
        <div className="modal-header">
          <h3>
            <FaUser /> Editar Perfil
          </h3>
          <button
            className="close-button"
            onClick={onClose}
            disabled={isLoading}
          >
            <FaTimes />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="nombre">Nombre</label>
              <input
                type="text"
                id="nombre"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ingresa tu nombre"
                disabled={isLoading}
                className={errors.nombre ? "error" : ""}
              />
              {errors.nombre && (
                <span className="error-text">{errors.nombre}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="apellidopaterno">Apellido Paterno</label>
                <input
                  type="text"
                  id="apellidopaterno"
                  name="apellidopaterno"
                  value={formData.apellidopaterno}
                  onChange={handleChange}
                  placeholder="Ingresa tu apellido paterno"
                  disabled={isLoading}
                  className={errors.apellidopaterno ? "error" : ""}
                />
                {errors.apellidopaterno && (
                  <span className="error-text">{errors.apellidopaterno}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="apellidomaterno">Apellido Materno</label>
                <input
                  type="text"
                  id="apellidomaterno"
                  name="apellidomaterno"
                  value={formData.apellidomaterno}
                  onChange={handleChange}
                  placeholder="Ingresa tu apellido materno"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="telefono">
                <FaPhone /> Teléfono
              </label>
              <input
                type="text"
                id="telefono"
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder="Ingresa tu número de teléfono"
                disabled={isLoading}
                className={errors.telefono ? "error" : ""}
              />
              {errors.telefono && (
                <span className="error-text">{errors.telefono}</span>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              disabled={isLoading}
            >
              <FaTimes /> Cancelar
            </button>
            <button type="submit" className="save-button" disabled={isLoading}>
              <FaSave /> {isLoading ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditProfileModal;
