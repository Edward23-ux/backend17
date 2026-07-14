const formulario = document.getElementById("formulario");

const mensaje = document.getElementById("mensaje");

formulario.addEventListener("submit", function (e) {

    e.preventDefault();

    const datos = {

        nombre: document.getElementById("nombre").value,
        apellido: document.getElementById("apellido").value,
        correo: document.getElementById("correo").value,
        edad: document.getElementById("edad").value

    };

    console.log(datos);

    mensaje.textContent = "Formulario enviado correctamente.";

    formulario.reset();

});