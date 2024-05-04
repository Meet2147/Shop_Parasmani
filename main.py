
import streamlit as st
import pandas as pd

# Custom function to create star rating component
def starrating(label, stars):
    star_click = st.radio(label, [f"{'★' * i}" for i in range(1, stars + 1)])
    return len(star_click)

def collect_user_data():
    st.title("User Data Collection Form")

    # Collect user input
    name = st.text_input("Name")
    locality = st.text_input("Locality")
    phone_number = st.text_input("Phone Number")
    first_time = st.radio("First time at our shop?", options=["Yes", "No"])
    rating = starrating("Rate your shopping experience (1-5)", 5)

    if st.button("Submit"):
        # Load CSV data from GitHub
        csv_file_url = "https://raw.githubusercontent.com/Meet2147/Shop_Parasmani/main/user_data.csv"
        data = pd.read_csv(csv_file_url)

        # Append the collected data to the CSV data
        new_data = pd.DataFrame({"Name": [name],
                                 "Locality": [locality],
                                 "Phone Number": [phone_number],
                                 "First Time": [first_time],
                                 "Rating": [rating]})
        data = pd.concat([data, new_data], ignore_index=True)

        # Write the updated data back to the CSV file on GitHub
        data.to_csv(csv_file_url, index=False)
        
        st.success("Data submitted successfully!")

if __name__ == "__main__":
    collect_user_data()
